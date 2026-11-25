import {animeAnswerKey} from '../public/quiz-rules.js';
import recordingAliases from './play-artist-recording-aliases.json' with {type:'json'};

// Spaces can vary in typed answers. Keep punctuation and symbols that identify the edition.
export const animeTitleKey = value => animeAnswerKey(value, true);

export function playFieldMatches(song, field, value) {
  if (field === 'artist') return song.answers.artist.some(name => artistMatches(name, value, song.artistRules));
  if (field === 'song') return titleMatches(song.answers.song, value);
  const guess = animeTitleKey(value);
  // Older matches stored stripped keys in answers.anime but retained the original title list.
  const titles = song.animeTitles?.length ? song.animeTitles : song.answers.anime;
  return Boolean(guess) && titles.some(title => animeTitleKey(title) === guess);
}

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
// Full credited names keep long-vowel aliases scoped to the individual performer.
const artistAliases = [
  ['Nagi Yanagi', 'yanaginagi'],
  ['Yuu Kobayashi', 'Yu Kobayashi'],
  ['Yuu Serizawa', 'Yu Serizawa'],
  // AMQ recording IDs document matching credits in the independent song sources.
  ['Fuuka Izumi', 'Fuka Izumi'],                 // 76269
  ['Hiyori Kouno', 'Hiyori Kono'],              // 53490
  ['Kanae Itou', 'Kanae Ito'],                   // 19158
  ['Kanako Itou', 'Kanako Ito'],                 // 14840
  ['Kazuhiko Katou', 'Kazuhiko Kato'],           // 14583
  ['Kazuya Ichijou', 'Kazuya Ichijo'],           // 79251
  ['Rina Satou', 'Rina Satoh'],                  // 53981
  ['Ryoutarou Okiayu', 'Ryotaro Okiayu'],        // 17009
  ['Shinichiro Kawakami', 'Shinichirou Kawakami'], // 11607
  ['Takayuki Kondou', 'Takayuki Kondo'],         // 18781
  ['Yuka Keichou', 'Yuka Keicho'],               // 64314
  ['Yuka Masui', 'Yuuka Masui'],                 // 81885
  ['Yuuko Oono', 'Yuko Ono'],                    // 46104
  ['Yurika Endou', 'Yurika Endo'],               // 22392
];
const artistAliasKeys = new Map(artistAliases.map(([alias,credit])=>[sortedArtistKey(alias),sortedArtistKey(credit)]));
export const artistAliasLabels = [...new Set(artistAliases.flat())];
export const artistKey = value => {
  const key=sortedArtistKey(value);
  return artistAliasKeys.get(key)??key;
};

// Ambiguous spellings are interchangeable only on independently corroborated AMQ recordings.
const aliasesByRecording = new Map();
for (const {name, alias, recordings} of recordingAliases) {
  const pair = [artistKey(name), artistKey(alias)];
  for (const id of recordings) {
    if (!aliasesByRecording.has(id)) aliasesByRecording.set(id, []);
    aliasesByRecording.get(id).push(pair);
  }
}

export function recordingArtistRules(credits, library, recordingId, amqCredit) {
  const pairs = aliasesByRecording.get(Number(recordingId)) || [];
  const localKey = value => {
    const key = artistKey(value);
    return pairs.find(pair => pair.includes(key))?.[0] ?? key;
  };
  // Compare performer lists before their words are sorted together into the stored group key.
  const creditParts = label => label.split(/\s*(?:[,、・&×]|\bfeat(?:uring)?\.?\s+)\s*/iu).map(localKey).join('|');
  const amqParts = amqCredit && creditParts(amqCredit);
  const rules = {};
  for (const credit of credits) {
    const key = artistKey(credit);
    const base = library[key] ?? library[sortedArtistKey(credit)];
    if (!pairs.length && (!amqCredit || credit === amqCredit)) {
      if (base) rules[key] = base;
      continue;
    }
    const sameCredit = amqParts && creditParts(credit) === amqParts;
    const amqRule = sameCredit && library[artistKey(amqCredit)];
    // A homonym's dictionary entry can have unrelated aliases. Use the recording's
    // own credited performer when the source uses the ambiguous spelling.
    const useRecordingCredit = pairs.length && sameCredit && key !== artistKey(amqCredit);
    let rule = base || amqRule;
    if (useRecordingCredit || (!base?.members && amqRule?.members)) rule = amqRule;
    const names = new Set([key, ...(rule?.names || [])]);
    if (sameCredit) names.add(artistKey(amqCredit));
    const expand = aliases => {
      const keys = new Set([...aliases].map(artistKey));
      return [...new Set([...aliases, ...pairs.filter(pair => pair.some(n => keys.has(n))).flat()])];
    };
    const fullNames = expand(names);
    if (rule || fullNames.length > 1) {
      rules[key] = {...rule, names:fullNames};
      if (pairs.length && rule?.members) rules[key].members = rule.members.map(expand);
    }
  }
  return rules;
}
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
  const expectedKey=artistKey(expected);
  const rule=rules[expectedKey]??rules[sortedArtistKey(expected)];
  const names=[expectedKey,...(rule?.names||[]).map(artistKey)];
  const isPerformer=part=>titleMatches(names,part);
  if(typeof submitted==='string'&&isPerformer(artistKey(submitted)))return true;
  const parts=[...new Set((Array.isArray(submitted)?submitted:String(submitted??'').split(',')).map(artistKey))];
  if(!parts.length||parts.includes(''))return false;
  const members=(rule?.members||[]).map(aliases=>aliases.map(artistKey));
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
