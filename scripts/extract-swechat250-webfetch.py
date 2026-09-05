#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from typing import Any, Iterable, Mapping

TOOL_NAME = "WebFetch"


def parse_transcript(value: Any) -> Any:
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, (list, dict)):
        raise ValueError("transcript_json must decode to an array or object")
    return value


def iter_messages(transcript: Any) -> Iterable[Mapping[str, Any]]:
    if isinstance(transcript, list):
        for message in transcript:
            if not isinstance(message, dict):
                raise ValueError("message array contains a non-object")
            yield message
        return

    if not isinstance(transcript, dict):
        raise ValueError("unsupported transcript shape")

    if "contexts" in transcript:
        contexts = transcript.get("contexts")
        if not isinstance(contexts, list):
            raise ValueError("contexts must be an array")
        for context in contexts:
            if not isinstance(context, dict):
                raise ValueError("context must be an object")
            messages = context.get("messages")
            if not isinstance(messages, list):
                raise ValueError("context messages must be an array")
            for message in messages:
                if not isinstance(message, dict):
                    raise ValueError("context message must be an object")
                yield message
        return

    if "messages" in transcript:
        messages = transcript.get("messages")
        if not isinstance(messages, list):
            raise ValueError("messages must be an array")
        for message in messages:
            if not isinstance(message, dict):
                raise ValueError("message must be an object")
            yield message
        return

    raise ValueError("unrecognized transcript object shape")


def extract_webfetch_events(transcript: Any) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    for message in iter_messages(parse_transcript(transcript)):
        role = message.get("role")
        if role is not None and role != "assistant":
            continue
        content = message.get("content")
        if not isinstance(content, list):
            continue
        timestamp = message.get("timestamp") if isinstance(message.get("timestamp"), str) else None
        for block in content:
            if not isinstance(block, Mapping):
                continue
            # Intentionally inspect only type before deciding whether any other field is admissible.
            if block.get("type") != "tool_use":
                continue
            if block.get("name") != TOOL_NAME:
                continue
            raw_input = block.get("input")
            tool_input = raw_input if isinstance(raw_input, Mapping) else {}
            events.append({
                "type": "assistant",
                "timestamp": timestamp,
                "message": {
                    "role": "assistant",
                    "content": [{
                        "type": "tool_use",
                        "name": TOOL_NAME,
                        "input": {
                            "url": tool_input.get("url"),
                            "prompt": tool_input.get("prompt"),
                        },
                    }],
                },
            })
    return events


def extract_parquet(input_path: Path, output_dir: Path, report_path: Path) -> dict[str, Any]:
    import pyarrow.parquet as pq

    table = pq.read_table(input_path, columns=["transcript_json"])
    rows = table.num_rows
    if rows != 250:
        raise ValueError(f"expected 250 rows, found {rows}")

    output_dir.mkdir(parents=True, exist_ok=False)
    transcripts = table.column("transcript_json").to_pylist()
    recognized_rows = 0
    webfetch_blocks = 0

    for index, value in enumerate(transcripts):
        events = extract_webfetch_events(value)
        recognized_rows += 1
        webfetch_blocks += len(events)
        session_path = output_dir / f"row-{index:03d}.jsonl"
        with session_path.open("w", encoding="utf-8", newline="\n") as handle:
            for event in events:
                handle.write(json.dumps(event, ensure_ascii=False, separators=(",", ":")))
                handle.write("\n")

    report = {
        "schema": "seenrelay-private292-swechat250-extraction-v1",
        "source_rows": rows,
        "recognized_transcript_rows": recognized_rows,
        "output_session_files": rows,
        "webfetch_blocks_emitted": webfetch_blocks,
        "tool_results_used": False,
        "repo_id_used": False,
        "cwd_used": False,
        "free_text_argument_inference_used": False,
        "raw_values_retained_in_report": False,
    }
    report_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    args = parser.parse_args()
    report = extract_parquet(args.input, args.output_dir, args.report)
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
