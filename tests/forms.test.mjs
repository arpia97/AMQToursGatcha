import {test}from'node:test';import assert from'node:assert/strict';
import{formIdentifier}from'../public/form-actions.js';
test('purchase submit dispatch uses the form attribute even when a named id control overrides form.id',()=>{
 const form={id:{tagName:'INPUT',name:'id',value:'42'},getAttribute:name=>name==='id'?'purchase-form':null};
 assert.notEqual(form.id,'purchase-form');assert.equal(formIdentifier(form),'purchase-form');
});
