import assert from 'node:assert/strict';
import {canonicalNotification,verifyYooMoneyNotification,PAYMENT_PACKAGES} from '../src/payments.mjs';

const params=new URLSearchParams();
for(const [k,v] of Object.entries({notification_type:'p2p-incoming',operation_id:'441361714955017004',amount:'98.00',withdraw_amount:'100.00',currency:'643',datetime:'2013-12-26T08:28:34Z',sender:'41000000000',codepro:'false',label:'ML23045',unaccepted:'false',sha1_hash:'ac13833bd6ba9eff1fa9e4bed76f3d6ebb57f6c0',sign:'a452af731650e2c5b39abcdc7c28dd27db7b3b654c2230ad2c386e64afb98605'}))params.set(k,v);
const canonical='amount=98.00&codepro=false&currency=643&datetime=2013-12-26T08%3A28%3A34Z&label=ML23045&notification_type=p2p-incoming&operation_id=441361714955017004&sender=41000000000&sha1_hash=ac13833bd6ba9eff1fa9e4bed76f3d6ebb57f6c0&unaccepted=false&withdraw_amount=100.00';
assert.equal(canonicalNotification(params),canonical,'canonical string must match YooMoney documentation');
assert.equal(await verifyYooMoneyNotification(params,'secret123'),true,'HMAC-SHA256 example must verify');
params.set('withdraw_amount','101.00');
assert.equal(await verifyYooMoneyNotification(params,'secret123'),false,'tampered notification must fail');
assert.equal(new Set(PAYMENT_PACKAGES.map(x=>x.id)).size,PAYMENT_PACKAGES.length,'package IDs must be unique');
for(const p of PAYMENT_PACKAGES){assert.ok(p.rub>0&&Number.isInteger(p.rub));assert.ok(p.credits>0&&Number.isInteger(p.credits));}
console.log('payments_yoomoney_test: OK');
