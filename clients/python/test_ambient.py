import asyncio
import unittest

from seenrelay_ambient import ambient_mcp_client, ambient_openai_agents_mcp_server


class Client:
    def __init__(self, values): self.values=list(values); self.i=0
    async def call_tool(self, name, arguments=None, *args, **kwargs):
        v=self.values[min(self.i,len(self.values)-1)]; self.i+=1; return v
    def ping(self): return 'pong'


class AmbientTests(unittest.IsolatedAsyncioTestCase):
    async def test_zero_config_exact_repeat(self):
        raw=Client([{'v':1},{'v':1}]); c=ambient_mcp_client(raw,server_key='demo')
        self.assertEqual(await c.call_tool('read',{'id':1}),{'v':1}); self.assertEqual(await c.call_tool('read',{'id':1}),{'v':1})
        r=c.get_report(); self.assertEqual(r['exact_unchanged_repeats'],1); self.assertFalse(r['interpretation']['automatic_reuse_authorized']); self.assertFalse(r['interpretation']['active_mode_available']); self.assertEqual(c.ping(),'pong')

    async def test_changed_repeat(self):
        c=ambient_mcp_client(Client([{'v':1},{'v':2}]),server_key='demo'); await c.call_tool('read',{'id':1}); await c.call_tool('read',{'id':1}); r=c.get_report(); self.assertEqual(r['exact_changed_repeats'],1); self.assertEqual(r['candidate_tools'],[])

    async def test_extra_context_is_preserved_and_refused(self):
        class C:
            def __init__(self): self.kw=None
            async def call_tool(self,name,arguments=None,*args,**kwargs): self.kw=kwargs; return {'ok':True}
        raw=C(); c=ambient_mcp_client(raw); await c.call_tool('read',{'id':1},meta='x'); self.assertEqual(raw.kw,{'meta':'x'}); self.assertEqual(c.get_report()['refused_measurements'],1)

    async def test_openai_agents_adapter(self):
        class Server:
            name='oa'
            def __init__(self): self.calls=0
            async def call_tool(self,name,arguments=None,meta=None): self.calls+=1; return {'name':name,'arguments':arguments}
            async def close(self): return 'closed'
        raw=Server(); s=ambient_openai_agents_mcp_server(raw); await s.call_tool('read',{'id':1}); await s.call_tool('read',{'id':1}); self.assertEqual(raw.calls,2); self.assertEqual(s.seenrelay_ambient['get_report']()['exact_unchanged_repeats'],1); self.assertEqual(await s.close(),'closed')


if __name__ == '__main__': unittest.main()
