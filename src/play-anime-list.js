import { libraryJSON } from "./quiz-library.js";
import { fail } from "./engine.js";

const query = `query WatchedList($name:String!, $chunk:Int!) {
  MediaListCollection(userName:$name,type:ANIME,chunk:$chunk,perChunk:500) {
    hasNextChunk lists { entries { status progress mediaId } }
  }
}`;

export function listAccount(provider, input) {
  if (!["myanimelist", "anilist"].includes(provider)) fail("Choose MyAnimeList or AniList.");
  let name = String(input ?? "").trim();
  if (/^(https?:\/\/|(?:www\.)?(?:myanimelist\.net|anilist\.co)\/)/i.test(name)) {
    let url;
    try { url = new URL(name.includes("://") ? name : "https://"+name); } catch { fail("Enter a valid profile or anime list URL."); }
    const parts=url.pathname.split("/").filter(Boolean);
    const valid=provider==="myanimelist"
      ? url.hostname.replace(/^www\./,"")==="myanimelist.net" && ["profile","animelist"].includes(parts[0])
      : url.hostname.replace(/^www\./,"")==="anilist.co" && parts[0]==="user" && (!parts[2]||parts[2]==="animelist");
    if(!valid || !parts[1])fail("Use a profile or anime list URL from the selected provider.");
    name=parts[1];
  }
  if(!/^[a-z0-9_-]{1,32}$/i.test(name))fail("Enter your list username or public profile URL.");
  return name;
}

export async function importAnimeList(provider,input,fetcher=(...args)=>globalThis.fetch(...args)) {
  const name=listAccount(provider,input), ids=new Set(), mal=provider==="myanimelist";
  const signal=AbortSignal.timeout(90000);
  let offset=0;
  for(let page=1;page<=100;page++){
    const url=mal?"https://myanimelist.net/animelist/"+encodeURIComponent(name)+"/load.json?status=7&offset="+offset:"https://graphql.anilist.co";
    const init=mal?{}:{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({query,variables:{name,chunk:page}})};
    let data;
    try {
      const res=await fetcher(url,{...init,signal,redirect:"manual"});
      if(res.status===429) fail("The list provider is rate limiting requests. Try refreshing later.",429);
      if([400,403,404].includes(res.status))fail("The provider could not share this list. Check the username and list privacy.",422);
      data=await libraryJSON(res,6000000);
    } catch(error){
      if([422,429].includes(error.status))throw error;
      fail("The anime list provider is unavailable. Try refreshing later.",502);
    }
    if(mal){
      if(!Array.isArray(data))fail("MyAnimeList could not share this list. Check its privacy settings.",422);
      for(const row of data){
        if(Number(row.status)!==6 && (Number(row.status)===2 || Number(row.num_watched_episodes)>0) && Number.isSafeInteger(row.anime_id) && row.anime_id>0)ids.add(row.anime_id);
      }
      if(!data.length)break;
      offset+=data.length;
    } else {
      const collection=data.data?.MediaListCollection;
      if(data.errors?.length||!Array.isArray(collection?.lists)||typeof collection.hasNextChunk!=="boolean")fail("AniList could not share this list. Check the username and list privacy.",422);
      for(const list of collection.lists)for(const row of list.entries){
        if(row.status!=="PLANNING" && (row.status==="COMPLETED" || row.status==="REPEATING" || row.progress>0) && Number.isSafeInteger(row.mediaId) && row.mediaId>0)ids.add(row.mediaId);
      }
      if(!collection.hasNextChunk)break;
    }
    if(page===100)fail("The list exceeded the import limit. Your saved list was kept.",422);
  }
  return {provider,name,count:ids.size,updated:Date.now(),ids:[...ids]};
}

export function listSummary(e,id){
  const row=e.one("SELECT json_remove(play_anime_list,'$.ids') AS summary FROM players WHERE id=?",id);
  return row?.summary ? JSON.parse(row.summary) : null;
}

