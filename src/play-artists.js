// Artist relationship rules adapted from the user's MIT-licensed AMQ Voicing
// Mode 2.0.0 (4Lajf / Zolhungaj). Keep group -> solo acceptance directional.
export const answerKey = value => String(value ?? '').normalize('NFKD')
  .replace(/\p{M}/gu, '').toLowerCase().replace(/[’'`]/g,'').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
// Compare complete answers; tolerate punctuation/spacing, never partial names.
export const titleKey = value => answerKey(value).replace(/\s+/g,'')||String(value??'').normalize('NFKC').replace(/\s+/g,'');
export const titleMatches = (expected,value) => {
  const key=titleKey(value);return !!key&&expected.some(answer=>titleKey(answer)===key);
};
const sortedArtistKey = value => answerKey(value).split(/\s+/).sort().join(' ');
const artistAliases = [['Nagi Yanagi', 'yanaginagi']];
const artistAliasKeys = new Map(artistAliases.map(([alias,credit])=>[sortedArtistKey(alias),sortedArtistKey(credit)]));
export const artistAliasLabels = artistAliases.map(([alias])=>alias);
export const artistKey = value => {
  const key=sortedArtistKey(value);
  return artistAliasKeys.get(key)??key;
};
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
      const composition=group.members.map(ref=>resolve(ref)[0]).filter(Boolean);
      rules[key]=memberNames.length===1?{names:[...new Set([...rule.names,...memberNames[0]])],composition}:{...rule,members:memberNames,composition};
    }
  }
  const songs=Object.fromEntries(Object.entries(master.songMap||{}).map(([id,s])=>[id,{title:s.name,artist:artists[s.songArtistId]?.name||groups[s.songGroupId]?.name||''}]));
  return {version:master.masterListId,names:[...labels].sort(),rules,songs};
}
export function artistMatches(expected, submitted, rules = {}) {
  const rule=rules[artistKey(expected)];
  const names=[artistKey(expected),...(rule?.names||[])];
  const isPerformer=part=>titleMatches(names,part);
  if(typeof submitted==='string'&&isPerformer(artistKey(submitted)))return true;
  const parts=[...new Set((Array.isArray(submitted)?submitted:String(submitted??'').split(',')).map(artistKey))];
  if(!parts.length||parts.includes(''))return false;
  const members=rule?.members||[];
  const covered=part=>members.some(aliases=>titleMatches(aliases,part));
  if(parts.some(isPerformer))return parts.every(part=>isPerformer(part)||covered(part));
  // Redundant member aliases can remain unmatched, but every submitted artist
  // must belong to the group and every member still needs a distinct answer.
  if(!members.length||parts.length<members.length||!parts.every(covered))return false;
  // One-to-one bipartite matching handles overlapping aliases without factorial work.
  const assigned=Array(parts.length).fill(-1);
  const visit=(member,seen)=>parts.some((part,j)=>{
    if(seen.has(j)||!titleMatches(members[member],part))return false;
    seen.add(j);
    if(assigned[j]===-1||visit(assigned[j],seen)){assigned[j]=member;return true;}
    return false;
  });
  return members.every((_,i)=>visit(i,new Set()));
}
export function submittedArtists(value){
  if(!Array.isArray(value)||value.length>50||value.some(name=>typeof name!=='string'||!name.trim()||name.length>300)||JSON.stringify(value).length>3500)
    throw Object.assign(Error('Submit individual artist names, up to 50 entries.'),{status:400});
  return value.map(name=>name.trim());
}
