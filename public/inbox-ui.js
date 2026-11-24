import { marketNoticeHref } from "./market-notice-link.js";
import { bindNotificationSoundControl, notificationSoundControl } from "./notification-sound.js?v=mute";
import { NOTICE_TYPES, NOTICE_GROUPS, noticeGroup, noticeDefault } from "./notification-types.js";
import { noticeCopy } from "./player-notices.js?v=market-notice-links";
import { playQuizHref } from "./play-navigation.js?v=play-quiz-links";

const glyph = { market:"⇄", wishlist:"♡", quiz:"♫", social:"✦", tour:"⚑" };
const color = { market:"#aadbbf", wishlist:"#ec9da9", quiz:"#c6b7ec", social:"#edcb89", tour:"#9bc9df" };

function describe(row, card) {
  const m = row.metadata || {}, name = card?.name || "A card", amount = Number(row.credits).toLocaleString();
  switch(row.kind) {
    case "flash-open": return ["The flash shop is open", "New stock · 3-hour window"];
    case "community-auction": return ["A new community auction opened", name];
    case "wish-shop": case "wish-auction": case "wish-trade":
      return [name + ({"wish-shop":" is in the shop","wish-auction":" is up for auction","wish-trade":" was listed for trade"}[row.kind]),
        ["On your wishlist", m.seller || m.venue, row.credits ? amount+" credits" : ""].filter(Boolean).join(" · ")];
    case "friend-add": return [(m.byName || "A player")+" added you as a friend","Friends"];
    case "quiz-new": return ["A new quiz is available",m.quizName];
    case "credit-reward": return ["You earned "+amount+" credits",m.reason];
    case "pickem-new": return ["A new tour pick’em is open",m.title];
    default: {
      const c=noticeCopy(row);
      return [c.title,[m.quizName,card?.name,c.detail].filter(Boolean).join(" · ")];
    }
  }
}

export function settingTabs(form, player, start) {
  const general=document.createElement("section"), notices=document.createElement("section"), tabs=document.createElement("div");
  general.className="stack inbox-general"; general.id="settings-general";
  notices.id="settings-notifications"; notices.className="inbox-prefs";
  for(const child of [...form.children]) if(!child.matches(".form-error,[type=submit]")) general.append(child);
  tabs.className="inbox-tabs"; tabs.setAttribute("role","tablist"); tabs.setAttribute("aria-label","Settings");
  const panels=[general,notices];
  function show(i) {
    panels.forEach((p,j)=>{p.hidden=i!==j; const tab=tabs.children[j];tab.setAttribute("aria-selected",String(i===j));tab.tabIndex=i===j?0:-1;});
  }
  panels.forEach((p,i)=>{
    const b=document.createElement("button");b.type="button";b.textContent=i?"Notifications":"General";
    b.id=p.id+"-tab";b.setAttribute("role","tab");b.setAttribute("aria-controls",p.id);p.setAttribute("role","tabpanel");p.setAttribute("aria-labelledby",b.id);
    b.onclick=()=>show(i);
    b.onkeydown=e=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();const n=e.key==="Home"?0:e.key==="End"?1:1-i;show(n);tabs.children[n].focus();}};
    tabs.append(b);
  });
  const prefs=player.notice_preferences || {};
  function group(key){
    const rows=Object.entries(NOTICE_TYPES).filter(([,v])=>v[0]===key).map(([kind,[,label]])=>{
      const friend=kind==="quiz-friend-beaten", on=friend?player.notify_friends_quiz:(prefs[kind]??noticeDefault(kind));
      return '<label class="inbox-pref">'+label+'<input type="checkbox" role="switch" data-notice-kind="'+kind+'" '+(friend?'name="notifyFriendsQuiz" ':'')+(on?'checked':'')+'></label>';
    });
    return '<section><h3><span style="color:'+color[key]+'">'+glyph[key]+'</span> '+NOTICE_GROUPS[key]+'</h3>'+rows.join("")+'</section>';
  }
  notices.innerHTML='<section class="inbox-sound-setting">'+notificationSoundControl()+'</section>'+
    [["market","wishlist"],["quiz","social","tour"]].map(col=>'<div>'+col.map(group).join("")+'</div>').join("");
  bindNotificationSoundControl(notices);
  form.prepend(tabs,general,notices); show(start==="notifications"?1:0);
  general.addEventListener("invalid",()=>show(0),true);
}
export function inboxSettings(form) {
  return Object.fromEntries([...form.querySelectorAll("[data-notice-kind]")].map(el=>[el.dataset.noticeKind,el.checked]));
}
export function inboxBulkControl(unread, latest) {
  return {action: unread ? "read" : "delete-all", label: unread ? "Mark all as read" : "Delete All", id: latest || 0};
}
export function createInbox({escape:e,cardBy,routeHref}) {
  let player=null, group="", unread=false, cursors=[], data=null;
  function query(id) {
    if(id!==player){player=id;data=null;group="";unread=false;cursors=[];}
    return "inbox?"+new URLSearchParams({group,unread:unread?"1":"0",before:String(cursors.at(-1)||0)});
  }
  function copy(r){return describe(r,r.card?cardBy(r.card):null);}
  function thumb(r){
    const g=noticeGroup(r.kind),m=r.metadata||{};
    const url=r.card?cardBy(r.card).image:(m.cover || (m.hasCover?"api/quiz-cover?quiz="+encodeURIComponent(m.quiz)+"&v="+encodeURIComponent(m.version):""));
    return '<span class="inbox-thumb" style="--accent:'+color[g]+'">'+(url?'<img src="'+e(url)+'" alt="" loading="lazy" referrerpolicy="no-referrer"><i>'+glyph[g]+'</i>':glyph[g])+'</span>';
  }
  function dateLabel(date) {
    const now=new Date(), yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
    return date.toDateString()===now.toDateString()?"Today":date.toDateString()===yesterday.toDateString()?"Yesterday":date.toLocaleDateString();
  }
  function rowButton(r,action="item"){
    const [title,detail]=copy(r), d=new Date(r.created);
    const href = marketNoticeHref(r, r.card ? cardBy(r.card) : null, routeHref);
    const destination = href ? ' data-market-href="'+e(href)+'"' : "";
    const open = '<button class="inbox-row" data-action="inbox-'+action+'" data-id="'+r.id+'"'+destination+' data-unread="'+!r.inbox_read+'"><span class="inbox-dot" aria-label="'+(r.inbox_read?"Read":"Unread")+'"></span>'+thumb(r)+'<span class="inbox-copy"><b>'+e(title)+'</b><small>'+e(detail||"")+'</small></span><time>'+e(d.toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}))+'</time></button>';
    return '<div class="inbox-entry">' + open + rowControl(r, title) + '</div>';
  }
  function rowControl(r, title = copy(r)[0]) {
    const label = r.inbox_read ? "Delete notification" : "Mark as read";
    return '<button type="button" class="inbox-check" data-action="inbox-' + (r.inbox_read ? "delete" : "check") + '" data-id="' + r.id +
      '" title="' + label + '" aria-label="' + label + ' · ' + e(title) + '">' + (r.inbox_read ? '×' : '✓') + '</button>';
  }
  function render(id) {
    if(!id)return '<h1>Notifications</h1><button class="button" data-action="signin-form">Sign in</button>';
    if(data?.player!==id)return '<p class="loading">Loading notifications…</p>';
    let previous="", rows="";
    for(const r of data.items){
      const d=new Date(r.created),day=dateLabel(d);
      if(previous!==day){rows+=(previous?"</div>":"")+'<h3 class="inbox-day">'+e(day)+'</h3><div class="inbox-group">';previous=day;}
      rows+=rowButton(r);
    }
    const button=(action,label,extra="")=>'<button class="secondary" data-action="inbox-'+action+'" '+extra+'>'+label+'</button>';
    const bulk=inboxBulkControl(data.unread,data.latest);
    return '<section class="inbox-feed"><header><div><span class="eyebrow">Gacha</span><h1>Notifications</h1></div><button class="secondary" data-action="edit-profile" data-settings-section="notifications">Settings</button></header><div class="inbox-tools"><div class="inbox-tabs">'+button("all","All",'aria-pressed="'+!unread+'"')+button("unread","Unread · "+data.unread,'aria-pressed="'+unread+'"')+'</div><select id="inbox-group" aria-label="Notification category"><option value="">All categories</option>'+Object.entries(NOTICE_GROUPS).map(([k,v])=>'<option value="'+k+'" '+(k===group?"selected":"")+'>'+v+'</option>').join("")+'</select>'+button(bulk.action,bulk.label,'data-id="'+bulk.id+'"'+(bulk.id?'':' disabled'))+'</div>'+(rows?rows+"</div>":'<p class="inbox-empty">No notifications in this view.</p>')+'<footer>'+(cursors.length?button("prev","← Newer"):"")+(data.more?button("next","Older →"):"")+'</footer></section>';
  }
  function detail(id, items=data?.items){
    const row=items?.find(r=>r.id===id);if(!row)return "";
    const [title,body]=copy(row),m=row.metadata||{};
    const target=row.kind==="friend-add"&&m.byId?"player/"+encodeURIComponent(m.byId):noticeGroup(row.kind)==="quiz"?"quiz":row.kind==="pickem-new"?"pickems/"+m.pickem:row.kind==="credit-reward"?"profile":row.kind.includes("auction")||row.kind==="outbid"?"auctions":"shop";
    let action='<a class="button" data-inbox-link href="'+e(routeHref(target))+'">Open '+(target.startsWith("player/")?"profile":target.split("/")[0])+' ↗</a>';
    if(target==="quiz")action='<a class="button" data-inbox-link href="'+e(playQuizHref(m.quiz))+'">Open quiz ↗</a>';
    const marketHref = marketNoticeHref(row, row.card ? cardBy(row.card) : null, routeHref);
    if (marketHref) action='<a class="button" data-inbox-link href="'+e(marketHref)+'">View '+(target==="auctions"?"auctions":row.kind==="trade-request"?"trade offers":row.kind==="wish-trade"?"trades":"shop")+' ↗</a>';
    return '<div class="inbox-detail">'+thumb(row)+'<h2>'+e(title)+'</h2><p>'+e(body||"")+'</p><small>'+e(new Date(row.created).toLocaleString())+'</small><p>'+action+'</p></div>';
  }
  return {query,render,detail,rowButton,rowControl,accept:v=>{data=v;},
    filter:value=>{group=value;cursors=[];}, view:a=>{
      if(a==="next" && data?.more)cursors.push(data.items.at(-1).id);
      else if(a==="prev")cursors.pop();
      else if(a==="delete-all")cursors=[];
      else if(a==="unread"||a==="all"){unread=a==="unread";cursors=[];}
    }};
}

