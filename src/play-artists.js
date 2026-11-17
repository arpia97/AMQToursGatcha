// Artist relationship rules adapted from the user's MIT-licensed AMQ Voicing
// Mode 2.0.0 (4Lajf / Zolhungaj). Keep group -> solo acceptance directional.
export const answerKey = value => String(value ?? '').normalize('NFKD')
  .replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const artistKey = value => answerKey(value).split(/\s+/).sort().join(' ');
const values = value => Array.isArray(value) ? value.flatMap(values) : value == null ? [] : typeof value !== 'object' ? [value]
  : ['name','artistName','artistId','songArtistId','id'].some(k => value[k] != null) ? [value]
  : Object.entries(value).flatMap(([key, v]) => v == null || v === true ? [key] : /^\d+$/.test(key) ? [v] : [key,v]);
const refId = ref => typeof ref === 'object' && ref ? String(ref.id ?? ref.artistId ?? ref.songArtistId ?? ref.artistID ?? ref.key ?? '') : String(ref ?? '');
export function buildArtistLibrary(master) {
  const artists = master.artistMap || {}, groups = master.groupMap || {}, parent = new Map(), labels = new Set();
  const find = key => { if (!parent.has(key)) parent.set(key,key); let root=key; while(parent.get(root)!==root) root=parent.get(root); while(parent.get(key)!==key){const next=parent.get(key);parent.set(key,root);key=next;} return root; };
  const join = names => { const keys=names.filter(Boolean).map(name=>{labels.add(name);return artistKey(name);}).filter(Boolean); for(const key of keys) parent.set(find(key),find(keys[0])); };
  const names = (id, record=artists[id]) => [record?.name,...values(record?.altNameLinks).map(ref=>artists[refId(ref)]?.name || (typeof ref==='object' ? ref.name || ref.artistName : /^\d+$/.test(String(ref)) ? '' : String(ref)))].filter(Boolean);
  const byName = new Map();
  for(const [id,record] of Object.entries(artists)) {const ns=names(id,record);join(ns);for(const name of ns)byName.set(artistKey(name),id);}
  const resolve = ref => {const id=refId(ref);return artists[id] ? names(id) : names(byName.get(artistKey(typeof ref==='object'?ref.name||ref.artistName:ref)));};
  const signatures = new Map(), groupRows=[];
  for(const [id,record] of Object.entries(groups)) {
    const members=values(record.artistMembers), signature=members.map(ref=>artists[refId(ref)]?refId(ref):byName.get(artistKey(ref))||'').filter(Boolean).sort().join('|');
    const ns=[record.name,...values(record.altNameLinks).map(ref=>groups[refId(ref)]?.name || (typeof ref==='string'&&!/^\d+$/.test(ref)?ref:''))].filter(Boolean);
    // Nested/unresolved membership must not accidentally equate two groups.
    const complete=members.length && signature.split('|').length===members.length && !values(record.groupMembers).length;
    if(complete) {const old=signatures.get(signature)||[];ns.push(...old);signatures.set(signature,ns);}
    join(ns);groupRows.push({id,ns,members,complete});
  }
  const components=new Map();
  for(const key of parent.keys()){const root=find(key);if(!components.has(root))components.set(root,[]);components.get(root).push(key);}
  const rules={};
  for(const key of parent.keys())rules[key]={names:components.get(find(key))};
  for(const group of groupRows) if(group.complete) {
    const memberNames=group.members.map(ref=>resolve(ref).flatMap(name=>rules[artistKey(name)]?.names||[artistKey(name)]));
    for(const name of group.ns) {
      const key=artistKey(name), rule=rules[key];
      rules[key]=memberNames.length===1?{names:[...new Set([...rule.names,...memberNames[0]])]}:{...rule,members:memberNames};
    }
  }
  const songs=Object.fromEntries(Object.entries(master.songMap||{}).map(([id,s])=>[id,{title:s.name,artist:artists[s.songArtistId]?.name||groups[s.songGroupId]?.name||''}]));
  return {version:master.masterListId,names:[...labels].sort(),rules,songs};
}
export function artistMatches(expected, submitted, rules = {}) {
  const key=artistKey(submitted); if(!key)return false;
  const rule=rules[artistKey(expected)];
  if(artistKey(expected)===key||rule?.names.includes(key))return true;
  if(!rule?.members)return false;
  const parts=String(submitted).split(',').map(artistKey).filter(Boolean);
  if(parts.length!==rule.members.length)return false;
  // Backtracking avoids a shared alias greedily consuming another member.
  const match=(i,remaining)=>i===rule.members.length||remaining.some((part,j)=>rule.members[i].includes(part)&&match(i+1,remaining.filter((_,k)=>k!==j)));
  return match(0,parts);
}
