import assert from "node:assert/strict";

// Disposable runtime fixtures register through the real individual-code flow.
export async function registerWithHostCode(post,host,body) {
  const issued=await post("host/invite",{player:body.player},host);
  assert.equal(issued.status,200,await issued.clone().text());
  const {code}=await issued.json();
  return post("register",{...body,code});
}
