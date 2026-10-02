import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const landing=read('src/landing.ts');
const fleet=read('src/fleet.ts');
const commercial=read('src/commercial.ts');
const agent=read('src/agent-adoption.ts');
const facts=JSON.parse(read('public/product-facts.json'));

test('customer-facing savings evidence is clearly not billing',()=>{
  assert.match(landing,/Currently free/i);
  assert.match(landing,/Savings Report/i);
  assert.match(landing,/not.*invoice.*bill.*charge.*payment receipt/i);
  assert.match(fleet,/SAVINGS REPORTS/);
  assert.match(fleet,/currently free/i);
  assert.match(fleet,/not an invoice, bill, charge, payment receipt/i);
  assert.match(commercial,/billing_enabled: false/);
  assert.match(commercial,/current_access: 'free_bootstrap'/);
});

test('machine facts reserve payment receipt for actual payment',()=>{
  assert.equal(facts.positioning.current_pricing,'free');
  assert.equal(facts.terminology.billing_enabled,false);
  assert.equal(facts.terminology.is_invoice,false);
  assert.equal(facts.terminology.is_payment_receipt,false);
  assert.equal(facts.terminology.payment_receipt_reserved_for_actual_payment,true);
  assert.match(agent,/savings_report_is_payment_receipt: false/);
  assert.match(agent,/payment_receipt_reserved_for_actual_payment: true/);
});

test('legacy receipt API wording is explicitly compatibility-only',()=>{
  assert.match(fleet,/onReceipt.*API compatibility/i);
  assert.match(agent,/legacy_name_notice/);
  assert.match(agent,/not payment/i);
});
