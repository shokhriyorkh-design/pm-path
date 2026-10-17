/* Путь продакта — учебное приложение. Данные: window.COURSE, хранилище: window.makeStore() */
(function(){
"use strict";
let C = null;
const $app = document.getElementById("app");

/* ---------- helpers ---------- */
function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs){
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "style") el.setAttribute("style", v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(9)){
    if (kid == null || kid === false) continue;
    el.appendChild(typeof kid === "string" || typeof kid === "number" ? document.createTextNode(String(kid)) : kid);
  }
  return el;
}
const today = () => new Date().toISOString().slice(0,10);
const pct = x => Math.round((x||0)*100);
function toast(msg){
  const t = h("div",{class:"toast",role:"status"},msg); document.body.appendChild(t);
  setTimeout(()=>t.remove(),2200);
}
function plural(n, a, b, c){ const m10=n%10, m100=n%100; return m10===1&&m100!==11?a:(m10>=2&&m10<=4&&(m100<10||m100>=20)?b:c); }

/* ---------- course index ---------- */
let MODS = []; let LESSONS = {}; let QS = {}; let CASES = {};
function indexCourse(course){
  C = course; MODS = course.modules.slice().sort((a,b)=>a.module-b.module); LESSONS = {}; QS = {}; CASES = {};
  MODS.forEach(m=>{
    (m.lessons||[]).forEach(l=>{ l._mod=m; LESSONS[l.id]=l; (l.questions||[]).forEach((q,i)=>{ q._id=l.id+"-q"+i; q._les=l; QS[q._id]=q; }); });
    (m.cases||[]).forEach(c=>{ c._mod=m; CASES[c.id]=c; });
  });
}
const LEVELS = [[0,"Стажёр"],[300,"Junior PM"],[1200,"Middle PM"],[2800,"Senior PM"],[5000,"Head of Product"]];
function level(xp){ let i=0; while(i<LEVELS.length-1 && xp>=LEVELS[i+1][0]) i++; const cur=LEVELS[i], nxt=LEVELS[i+1]; return {name:cur[1], next:nxt&&nxt[1], need:nxt?nxt[0]:cur[0], from:cur[0], frac: nxt ? (xp-cur[0])/(nxt[0]-cur[0]) : 1}; }

/* ---------- state ---------- */
let P = blank();
function blank(){ return {v:1, lessons:{}, answered:{}, cases:{}, tasks:{}, xp:0, log:[], days:[], mistakes:[], last:null}; }
let store = null, saveTimer = null, saving = false, dirty = false;
function touch(){
  const d = today(); if (!P.days.includes(d)) { P.days.push(d); P.days = P.days.slice(-90); }
  dirty = true; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 900);
}
async function flush(){
  if (!store || saving || !dirty) return;
  saving = true; dirty = false;
  try { await store.save(JSON.parse(JSON.stringify(P))); }
  catch(e){ console.warn("save failed", e); dirty = true; }
  saving = false; if (dirty) { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 1500); }
}
function merge(a, b){ // keep the best of two progress objects
  if (!b) return a; if (!a) return b;
  const out = blank();
  out.xp = Math.max(a.xp||0, b.xp||0);
  for (const src of [a,b]){
    for (const k in src.lessons||{}){ const o=out.lessons[k]||{}, s=src.lessons[k]; out.lessons[k]={best:Math.max(o.best||0,s.best||0), done:!!(o.done||s.done), seen:true}; }
    for (const k in src.cases||{}){ const o=out.cases[k]||{}, s=src.cases[k]; out.cases[k]={best:Math.max(o.best||0,s.best||0), done:!!(o.done||s.done)}; }
    Object.assign(out.answered, src.answered||{});
    for (const k in src.tasks||{}){ const o=out.tasks[k]||{}, t=src.tasks[k]; out.tasks[k]={done:!!(o.done||t.done), checks:(t.checks||[]).map((c,i)=>!!(c||(o.checks||[])[i])), note:(t.note&&t.note.length>=(o.note||"").length)?t.note:(o.note||"")}; }
    (src.days||[]).forEach(d=>{ if(!out.days.includes(d)) out.days.push(d); });
  }
  out.days.sort(); out.days = out.days.slice(-90);
  out.mistakes = Array.from(new Set([...(a.mistakes||[]),...(b.mistakes||[])])).filter(id=>QS[id] && out.answered[id]!==1);
  out.log = [...(a.log||[]),...(b.log||[])].sort((x,y)=>y.t-x.t).filter((e,i,arr)=>i===0||e.t!==arr[i-1].t).slice(0,40);
  out.last = (a.last && b.last) ? (a.last.t>b.last.t?a.last:b.last) : (a.last||b.last);
  return out;
}
function addXP(n, what){ if(!n) return; P.xp += n; P.log.unshift({t:Date.now(), xp:n, what}); P.log = P.log.slice(0,40); }

/* ---------- progress queries ---------- */
function modProgress(m){
  const ls = m.lessons||[]; if (!ls.length) return 0;
  return ls.reduce((s,l)=>s+(P.lessons[l.id]?.done?1:(P.lessons[l.id]?.best||0)*0.5),0)/ls.length;
}
function nextLesson(){
  if (P.last && LESSONS[P.last.id] && !P.lessons[P.last.id]?.done) return LESSONS[P.last.id];
  for (const m of MODS) for (const l of m.lessons||[]) if (!P.lessons[l.id]?.done) return l;
  return null;
}

/* ---------- routing (in-memory) ---------- */
let route = {name:"home"};
let ctx = {mode:"local", user:null, isAdmin:false};
function go(r){ route = r; render(); window.scrollTo({top:0}); }

/* ---------- shell ---------- */
function shell(main, side){
  const tabs = [["home","Обзор"],["learn","Уроки"],["trainer","Тренажёр"],["tasks","Задачи"],["review","Ошибки"+(P.mistakes.length?" · "+P.mistakes.length:"")],["blitz","Блиц"],["gloss","Словарь"]];
  if (ctx.isAdmin) tabs.push(["admin","Админка"]);
  const cur = {module:"learn", lesson:"learn", case:"trainer", task:"tasks"}[route.name] || route.name;
  const bar = h("header",{class:"bar"}, h("div",{class:"bar-in"},
    h("button",{class:"logo",onclick:()=>go({name:"home"}),"aria-label":"На главную"}, h("i",null,"PM"), h("b",null,"Путь продакта")),
    h("nav",{class:"nav","aria-label":"Разделы"}, tabs.map(([k,t])=>h("button",{"aria-current":String(cur===k),onclick:()=>go({name:k})},t))),
    h("div",{class:"acct"},
      ctx.user ? h("span",{class:"who"}, ctx.user.name||ctx.user.email||"") : null,
      ctx.signOut ? h("button",{class:"btn ghost",style:"padding:6px 10px;font-size:13px",onclick:ctx.signOut},"Выйти") : null)
  ));
  const body = side ? h("div",{class:"grid"}, h("div",{class:"col"}, main), h("aside",{class:"side"}, side)) : h("div",{class:"col"}, main);
  $app.replaceChildren(bar, h("main",{class:"wrap"}, body));
  const curBtn = bar.querySelector('.nav [aria-current="true"]');
  if (curBtn && curBtn.parentElement.scrollWidth > curBtn.parentElement.clientWidth) curBtn.parentElement.scrollLeft = curBtn.offsetLeft - 16;
}
function sidePanel(){
  const lv = level(P.xp);
  const lastDays = []; for (let i=27;i>=0;i--){ const d=new Date(Date.now()-i*864e5).toISOString().slice(0,10); lastDays.push(d); }
  let streak=0; for (let i=0;;i++){ const d=new Date(Date.now()-i*864e5).toISOString().slice(0,10); if (P.days.includes(d)) streak++; else if (i>0) break; else continue; if(i>400)break; }
  const doneL = Object.values(P.lessons).filter(x=>x.done).length;
  const totalL = Object.keys(LESSONS).length;
  return [
    h("section",{class:"stmt","aria-label":"Выписка по опыту"},
      h("header",null, h("div",null, h("div",{class:"eyebrow"},"Счёт опыта"), h("div",{class:"bal"}, P.xp.toLocaleString("ru-RU")+" XP")),
        h("div",{style:"text-align:right"}, h("div",{class:"eyebrow"},"Уровень"), h("b",null,lv.name))),
      h("div",{style:"padding:12px 16px;border-bottom:1px solid var(--line)"},
        h("div",{class:"meter"}, h("span",{style:"width:"+pct(lv.frac)+"%"})),
        h("div",{style:"font-size:12px;color:var(--muted);margin-top:6px"}, lv.next ? `До уровня ${lv.next}: ${(lv.need-P.xp).toLocaleString("ru-RU")} XP` : "Максимальный уровень")),
      P.log.length ? h("ul",null, P.log.slice(0,12).map(e=>h("li",null, h("span",null,e.what), h("b",null,"+"+e.xp))))
                   : h("div",{class:"empty"},"Пока пусто. За каждый верный ответ начисляется опыт.")),
    h("section",{class:"panel"},
      h("dl",{class:"kv",style:"margin:0 0 12px"},
        h("dt",null,"Уроков пройдено"), h("dd",null, `${doneL} / ${totalL}`),
        h("dt",null,"Серия дней"), h("dd",null, String(streak)),
        h("dt",null,"Ошибок на повторение"), h("dd",null, String(P.mistakes.length))),
      h("div",{class:"eyebrow",style:"margin-bottom:6px"},"Активность, 4 недели"),
      h("div",{class:"days"}, lastDays.map(d=>h("i",{class:P.days.includes(d)?"on":"",title:d}))),
      h("div",{class:"notice",style:"margin-top:12px"}, ctx.syncNote || "Прогресс сохраняется автоматически."))
  ];
}

/* ---------- screens ---------- */
function home(){
  const nl = nextLesson(); const lv = level(P.xp);
  const done = Object.values(P.lessons).filter(x=>x.done).length;
  const main = [
    h("section",{class:"hero"},
      h("div",null, h("div",{class:"eyebrow"},"Продакт-менеджер в банке и финтехе"),
        h("h1",{class:"h1",style:"margin:8px 0 10px"}, ctx.user?.name ? `${ctx.user.name.split(" ")[0]}, продолжим?` : "От дизайнера к продакту"),
        h("p",{class:"lead"},"Курс в формате тренажёра: короткая теория с хайлайтами, квизы с разбором каждой ошибки и кейсы, где ты принимаешь решения как продакт в банке.")),
      h("div",{class:"tier panel"},
        h("div",{class:"eyebrow"},"Твой уровень"), h("b",{style:"font-size:20px"},lv.name),
        h("div",{class:"meter"},h("span",{style:"width:"+pct(lv.frac)+"%"})),
        h("small",{style:"color:var(--muted)"}, `${done} ${plural(done,"урок","урока","уроков")} из ${Object.keys(LESSONS).length}`))),
    nl ? h("section",{class:"panel",style:"display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap"},
      h("div",{style:"min-width:0"}, h("div",{class:"eyebrow"}, `Дальше · Модуль ${nl._mod.module}`), h("h2",{class:"h2",style:"margin-top:4px"}, nl.title), h("p",{class:"lead",style:"margin-top:4px"}, nl.summary)),
      h("button",{class:"btn primary",onclick:()=>go({name:"lesson",id:nl.id})},"Открыть урок")) :
      h("section",{class:"panel"}, h("h2",{class:"h2"},"Все уроки пройдены"), h("p",{class:"lead"},"Закрепи материал в тренажёре и блице.")),
    h("section",null, h("div",{class:"eyebrow",style:"margin-bottom:10px"},"Программа"), modList()),
    h("section",{class:"btn-row"},
      h("button",{class:"btn",onclick:()=>go({name:"trainer"})},"Тренажёр кейсов"),
      h("button",{class:"btn",onclick:()=>go({name:"tasks"})},"Практические задачи"),
      h("button",{class:"btn",onclick:()=>go({name:"blitz"})},"Блиц: 10 случайных вопросов"),
      P.mistakes.length ? h("button",{class:"btn",onclick:()=>go({name:"review"})},`Повторить ошибки (${P.mistakes.length})`) : null)
  ];
  shell(main, sidePanel());
}
function modList(){
  return h("div",{class:"mods"}, MODS.map(m=>{
    const p = modProgress(m); const nL=(m.lessons||[]).length, nQ=(m.lessons||[]).reduce((s,l)=>s+(l.questions||[]).length,0);
    return h("button",{class:"mod",onclick:()=>go({name:"module",m:m.module})},
      h("div",{class:"no"}, String(m.module).padStart(2,"0")),
      h("div",{style:"min-width:0"}, h("h3",null,m.title), h("p",null, `${nL} ${plural(nL,"урок","урока","уроков")} · ${nQ} ${plural(nQ,"вопрос","вопроса","вопросов")} · ${(m.cases||[]).length} ${plural((m.cases||[]).length,"кейс","кейса","кейсов")}`)),
      h("div",{class:"ring",style:"--p:"+pct(p)}, h("b",null, pct(p)+"%")));
  }));
}
function learn(){ shell([h("div",null,h("div",{class:"eyebrow"},"Все модули"),h("h1",{class:"h1",style:"margin-top:6px"},"Уроки")), modList()], sidePanel()); }
function moduleScreen(){
  const m = MODS.find(x=>x.module===route.m); if(!m) return go({name:"learn"});
  const main = [
    h("div",null, h("button",{class:"btn ghost",style:"padding:6px 0;border:0",onclick:()=>go({name:"learn"})},"← Все модули"),
      h("div",{class:"eyebrow",style:"margin-top:8px"},"Модуль "+m.module), h("h1",{class:"h1",style:"margin-top:6px"},m.title)),
    h("div",{class:"lessons"}, (m.lessons||[]).map((l,i)=>{
      const st = P.lessons[l.id];
      return h("button",{class:"les",onclick:()=>go({name:"lesson",id:l.id})},
        h("span",{class:"st"+(st?.done?" done":st?.seen?" part":"")}, st?.done?"✓":""),
        h("div",{style:"min-width:0"}, h("div",{style:"font-weight:600"}, l.title), h("div",{style:"font-size:14px;color:var(--muted)"}, l.highlight)),
        h("small",null, st?.best!=null ? pct(st.best)+"%" : (l.questions||[]).length+" вопр."));
    })),
    (m.cases||[]).length ? h("section",null, h("div",{class:"eyebrow",style:"margin-bottom:10px"},"Кейсы модуля"), caseGrid(m.cases)) : null
  ];
  shell(main, sidePanel());
}

/* ---------- lesson ---------- */
function lessonScreen(){
  const l = LESSONS[route.id]; if(!l) return go({name:"learn"});
  P.lessons[l.id] = Object.assign({best:0,done:false}, P.lessons[l.id], {seen:true});
  P.last = {id:l.id, t:Date.now()}; touch();
  const m = l._mod; const idx = m.lessons.indexOf(l);
  const main = [
    h("div",null, h("button",{class:"btn ghost",style:"padding:6px 0;border:0",onclick:()=>go({name:"module",m:m.module})},"← "+m.title),
      h("div",{class:"eyebrow",style:"margin-top:8px"}, `Модуль ${m.module} · урок ${idx+1} из ${m.lessons.length}`),
      h("h1",{class:"h1",style:"margin-top:6px"}, l.title)),
    h("section",{class:"thirty"}, h("div",{class:"eyebrow"},"Главное за 30 секунд"), h("p",null,l.summary)),
    l.keypoints?.length ? h("section",{class:"panel"}, h("h2",{class:"h2",style:"margin-bottom:6px"},"Ключевые идеи"), h("ol",{class:"keys"}, l.keypoints.map(k=>h("li",null,h("span",null,k))))) : null,
    l.example ? h("section",{class:"example"}, h("div",{class:"eyebrow"},"Пример"), h("p",null,l.example)) : null,
    l.highlight ? h("section",{class:"panel"}, h("div",{class:"eyebrow",style:"margin-bottom:4px"},"Запомни"), h("div",{class:"quote-hl"}, h("span",null,l.highlight))) : null,
    (l.questions||[]).length ? h("section",{class:"panel",id:"quizbox"}, quizIntro(l)) : null
  ];
  shell(main, sidePanel());
}
function quizIntro(l){
  const st = P.lessons[l.id];
  return h("div",{class:"quiz"},
    h("h2",{class:"h2"},"Проверь себя"),
    h("p",{class:"lead"}, `${l.questions.length} ${plural(l.questions.length,"вопрос","вопроса","вопросов")}. Ошибся — сразу покажу, почему вариант неверный и какой правильный. Урок засчитывается от 70%.`),
    st?.best ? h("div",{class:"notice"}, `Лучший результат: ${pct(st.best)}%`) : null,
    h("div",{class:"btn-row"}, h("button",{class:"btn primary",onclick:e=>startQuiz(e.target.closest("section"), l.questions, {lesson:l})}, st?.best?"Пройти ещё раз":"Начать квиз")));
}

/* ---------- quiz engine ---------- */
function perm(n){ const a=[...Array(n).keys()]; for(let i=n-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
function shuffledQ(q){ const p=perm(q.options.length); return Object.assign(Object.create(q), {_id:q._id, options:p.map(k=>q.options[k]), wrong:p.map(k=>(q.wrong||[])[k]), answer:p.indexOf(q.answer)}); }
function shuffledStep(s){ const p=perm(s.options.length); return Object.assign({}, s, {options:p.map(k=>s.options[k]), feedback:p.map(k=>(s.feedback||[])[k]), answer:p.indexOf(s.answer)}); }
let keyHandler = null;
function setKeys(fn){ if(keyHandler) document.removeEventListener("keydown", keyHandler); keyHandler = fn; if(fn) document.addEventListener("keydown", fn); }
function startQuiz(box, questions, opts){
  const qs = questions.slice(); let i = 0; const res = [];
  const first = {}; // qid -> first-attempt correctness in this run
  function show(){
    const q = shuffledQ(qs[i]); let picked = null;
    const dots = h("div",{class:"dots","aria-hidden":"true"}, qs.map((_,k)=>h("i",{class: k<i ? (res[k]?"ok":"no") : k===i ? "now" : ""})));
    const fbBox = h("div",{"aria-live":"polite"});
    const nextBtn = h("button",{class:"btn primary",disabled:true,onclick:next}, i===qs.length-1?"Результат":"Дальше");
    const optEls = q.options.map((o,k)=>h("button",{class:"opt",onclick:()=>pick(k)}, h("kbd",null,String(k+1)), h("span",null,o)));
    function pick(k){
      if (picked!==null) return; picked = k;
      const ok = k===q.answer; res[i]=ok;
      optEls.forEach((el,j)=>{ el.disabled=true; if(j===q.answer) el.classList.add("right"); else if(j===k) el.classList.add("wrong"); else el.classList.add("dim"); });
      const wasRight = P.answered[q._id]===1;
      P.answered[q._id] = ok?1:0;
      if (ok){ P.mistakes = P.mistakes.filter(x=>x!==q._id); const gain = wasRight?2:10; addXP(gain, opts.lesson?opts.lesson.title:"Повторение"); }
      else if (!P.mistakes.includes(q._id)) P.mistakes.push(q._id);
      touch();
      fbBox.replaceChildren(ok
        ? h("div",{class:"fb ok"}, h("b",null,"Верно. ", h("span",{class:"xp-pop"}, wasRight?"+2 XP":"+10 XP")), h("p",null,q.explain))
        : h("div",{class:"fb no"}, h("b",null,"Не совсем."), q.wrong && q.wrong[k] ? h("p",null, h("strong",null,"Почему нет: "), q.wrong[k]) : null,
            h("p",{class:"fix"}, h("strong",null,"Правильно: "), q.options[q.answer], ". ", q.explain)));
      nextBtn.disabled=false; nextBtn.focus({preventScroll:true});
    }
    function next(){ if (picked===null) return; i++; if (i<qs.length) show(); else finish(); }
    setKeys(e=>{ if(e.target.closest("input,textarea")) return; const n=parseInt(e.key,10); if(n>=1&&n<=q.options.length) pick(n-1); else if(e.key==="Enter"&&picked!==null){ e.preventDefault(); next(); } });
    box.replaceChildren(h("div",{class:"quiz"},
      h("div",{class:"qhead"}, h("span",{class:"num"}, `Вопрос ${i+1} / ${qs.length}`), dots),
      opts.showSource ? h("div",{class:"tag"}, `Модуль ${q._les._mod.module} · ${q._les.title}`) : null,
      h("div",{class:"qtext"}, q.q), h("div",{class:"opts"}, optEls), fbBox, h("div",{class:"btn-row"}, nextBtn)));
  }
  function finish(){
    setKeys(null);
    const score = res.filter(Boolean).length/qs.length;
    if (opts.lesson){
      const st = P.lessons[opts.lesson.id]; const before = !!st.done;
      st.best = Math.max(st.best||0, score); if (score>=0.7) st.done = true;
      if (st.done && !before) addXP(30, "Урок пройден: "+opts.lesson.title);
    }
    touch();
    const missed = qs.filter((_,k)=>!res[k]);
    box.replaceChildren(h("div",{class:"quiz"},
      h("div",{class:"score"}, h("span",{class:"big num"}, pct(score)+"%"), h("span",{class:"lead"}, `${res.filter(Boolean).length} из ${qs.length} верно`)),
      h("p",null, score===1 ? "Безупречно. Можно идти дальше." : score>=0.7 ? "Урок засчитан. Ошибки сохранены в раздел «Ошибки» — вернись к ним через день." : "Пока меньше 70%. Перечитай ключевые идеи и попробуй снова."),
      missed.length ? h("div",null, h("div",{class:"eyebrow",style:"margin-bottom:8px"},"Разбор ошибок"),
        h("ul",{class:"misslist"}, missed.map(q=>h("li",null, q.q, h("em",null,"→ "+q.options[q.answer]))))) : null,
      h("div",{class:"btn-row"},
        missed.length ? h("button",{class:"btn primary",onclick:()=>startQuiz(box, missed, opts)},"Повторить ошибки") : null,
        opts.lesson ? nextLessonBtn(opts.lesson) : null,
        h("button",{class:"btn",onclick:()=>opts.onDone ? opts.onDone() : startQuiz(box, questions, opts)}, opts.onDone?"Готово":"Пройти заново"))));
    render.sideOnly && render.sideOnly();
  }
  show();
}
function nextLessonBtn(l){
  const m=l._mod, i=m.lessons.indexOf(l), n=m.lessons[i+1];
  if (n) return h("button",{class:"btn primary",onclick:()=>go({name:"lesson",id:n.id})},"Следующий урок →");
  const nm = MODS[MODS.indexOf(m)+1];
  return nm ? h("button",{class:"btn primary",onclick:()=>go({name:"module",m:nm.module})},"Следующий модуль →") : null;
}

/* ---------- review & blitz ---------- */
function review(){
  const qs = P.mistakes.map(id=>QS[id]).filter(Boolean);
  const box = h("section",{class:"panel"});
  const main = [h("div",null,h("div",{class:"eyebrow"},"Интервальное повторение"),h("h1",{class:"h1",style:"margin-top:6px"},"Мои ошибки"),
      h("p",{class:"lead",style:"margin-top:8px"},"Сюда попадает каждый вопрос, на который ты ответил неверно. Ответишь правильно — он уйдёт из списка.")), box];
  if (!qs.length) box.append(h("p",{style:"margin:0"},"Ошибок на повторение нет. Отличная работа."));
  else box.append(h("div",{class:"quiz"}, h("p",{style:"margin:0"}, `${qs.length} ${plural(qs.length,"вопрос","вопроса","вопросов")} ждут повторения.`),
      h("div",{class:"btn-row"}, h("button",{class:"btn primary",onclick:()=>startQuiz(box, shuffle(qs).slice(0,15), {showSource:true,onDone:()=>go({name:"review"})})},"Повторить"))));
  shell(main, sidePanel());
}
function shuffle(a){ a=a.slice(); for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; }
let blitzMod = "all";
function blitz(){
  const box = h("section",{class:"panel"});
  const pool = () => Object.values(QS).filter(q=>blitzMod==="all"||String(q._les._mod.module)===blitzMod);
  const seg = h("div",{class:"seg",role:"group","aria-label":"Модуль"},
    [["all","Все"],...MODS.map(m=>[String(m.module),"М"+m.module])].map(([k,t])=>h("button",{"aria-pressed":String(blitzMod===k),onclick:()=>{blitzMod=k; go({name:"blitz"});}},t)));
  box.append(h("div",{class:"quiz"}, h("p",{style:"margin:0"},`10 случайных вопросов из ${pool().length}. Хорошо подходит для ежедневной разминки на 5 минут.`),
    h("div",{class:"btn-row"}, h("button",{class:"btn primary",onclick:()=>startQuiz(box, shuffle(pool()).slice(0,10), {showSource:true,onDone:()=>go({name:"blitz"})})},"Начать блиц"))));
  shell([h("div",null,h("div",{class:"eyebrow"},"Смешанный режим"),h("h1",{class:"h1",style:"margin-top:6px"},"Блиц")), seg, box], sidePanel());
}

/* ---------- trainer ---------- */
function caseGrid(list){
  return h("div",{class:"cases"}, list.map(c=>{ const st=P.cases[c.id];
    return h("button",{class:"case",onclick:()=>go({name:"case",id:c.id})},
      h("span",{class:"tag"+(st?.done?" done":"")}, st?.done ? `Пройден · ${pct(st.best)}%` : `Модуль ${c._mod.module} · ${c.steps.length} ${plural(c.steps.length,"шаг","шага","шагов")}`),
      h("h3",null,c.title), h("p",null,c.context)); }));
}
function trainer(){
  const all = Object.values(CASES);
  const done = all.filter(c=>P.cases[c.id]?.done).length;
  shell([h("div",null,h("div",{class:"eyebrow"},`Тренажёр решений · пройдено ${done} из ${all.length}`),h("h1",{class:"h1",style:"margin-top:6px"},"Кейсы продакта"),
      h("p",{class:"lead",style:"margin-top:8px"},"Реальные ситуации из работы продакта в банке. На каждом шаге выбираешь решение и сразу получаешь разбор: что сработает, а что нет и почему.")),
    ...MODS.filter(m=>(m.cases||[]).length).map(m=>h("section",null,h("div",{class:"eyebrow",style:"margin-bottom:10px"},`Модуль ${m.module}. ${m.title}`), caseGrid(m.cases)))], sidePanel());
}
function caseScreen(){
  const c = CASES[route.id]; if(!c) return go({name:"trainer"});
  let i=0; const res=[];
  const box = h("div",{class:"col"});
  function step(){
    const s=shuffledStep(c.steps[i]); let picked=null;
    const track = h("div",{class:"steps-track","aria-hidden":"true"}, c.steps.map((_,k)=>h("i",{class:k<i?(res[k]?"ok":"no"):k===i?"now":""})));
    const fb = h("div",{"aria-live":"polite"});
    const nextBtn = h("button",{class:"btn primary",disabled:true,onclick:()=>{ i++; i<c.steps.length?step():end(); }}, i===c.steps.length-1?"Итог кейса":"Следующий шаг");
    const opts = s.options.map((o,k)=>h("button",{class:"opt",onclick:()=>pick(k)}, h("kbd",null,String(k+1)), h("span",null,o)));
    function pick(k){ if(picked!==null) return; picked=k; const ok=k===s.answer; res[i]=ok;
      opts.forEach((el,j)=>{ el.disabled=true; if(j===s.answer) el.classList.add("right"); else if(j===k) el.classList.add("wrong"); else el.classList.add("dim"); });
      fb.replaceChildren(h("div",{class:"fb "+(ok?"ok":"no")}, h("b",null, ok?"Сильное решение.":"Есть вариант лучше."), h("p",null, s.feedback?.[k]||""),
        !ok ? h("p",{class:"fix"}, h("strong",null,"Лучшее решение: "), s.options[s.answer], ". ", s.feedback?.[s.answer]||"") : null));
      nextBtn.disabled=false; }
    setKeys(e=>{ const n=parseInt(e.key,10); if(n>=1&&n<=s.options.length) pick(n-1); else if(e.key==="Enter"&&picked!==null) nextBtn.click(); });
    box.replaceChildren(
      h("section",{class:"brief"}, h("div",{class:"eyebrow"},"Ситуация"), h("p",null,c.context)),
      h("section",{class:"panel"}, h("div",{class:"quiz"}, h("div",{class:"qhead"}, h("span",{class:"num"},`Шаг ${i+1} / ${c.steps.length}`)), track,
        h("div",{class:"qtext"}, s.prompt), h("div",{class:"opts"}, opts), fb, h("div",{class:"btn-row"}, nextBtn))));
  }
  function end(){
    setKeys(null);
    const score = res.filter(Boolean).length/c.steps.length;
    const st = P.cases[c.id] || {best:0,done:false}; const first = !st.done;
    st.best = Math.max(st.best, score); st.done = true; P.cases[c.id]=st;
    if (first) addXP(Math.round(20+40*score), "Кейс: "+c.title);
    touch();
    box.replaceChildren(h("section",{class:"panel"}, h("div",{class:"quiz"},
      h("div",{class:"score"}, h("span",{class:"big num"}, pct(score)+"%"), h("span",{class:"lead"},`${res.filter(Boolean).length} из ${c.steps.length} решений — лучшие`)),
      h("div",{class:"eyebrow"},"Вывод кейса"), h("div",{class:"quote-hl"}, h("span",null,c.takeaway)),
      h("div",{class:"btn-row"}, h("button",{class:"btn primary",onclick:()=>go({name:"trainer"})},"К другим кейсам"), h("button",{class:"btn",onclick:()=>{i=0;res.length=0;step();}},"Пройти заново")))));
  }
  shell([h("div",null, h("button",{class:"btn ghost",style:"padding:6px 0;border:0",onclick:()=>go({name:"trainer"})},"← Все кейсы"),
    h("div",{class:"eyebrow",style:"margin-top:8px"},"Кейс · Модуль "+c._mod.module), h("h1",{class:"h1",style:"margin-top:6px"},c.title)), box], sidePanel());
  step();
}

/* ---------- tasks (задачник) ---------- */
let taskTrack = "all";
const TRACK = {pm:"Продакт", design:"Дизайнер"};
const LEVEL = {1:"Новичок", 2:"Средний", 3:"Продвинутый"};
function tasksScreen(){
  const all = C.tasks||[];
  const list = all.filter(t=>taskTrack==="all"||t.track===taskTrack);
  const done = all.filter(t=>P.tasks[t.id]?.done).length;
  const seg = h("div",{class:"seg",role:"group","aria-label":"Трек"}, [["all","Все"],["pm","Для продакта"],["design","Для дизайнера"]].map(([k,t])=>
    h("button",{"aria-pressed":String(taskTrack===k),onclick:()=>{taskTrack=k;go({name:"tasks"});}},t)));
  shell([h("div",null,h("div",{class:"eyebrow"},`Задачник · выполнено ${done} из ${all.length}`),h("h1",{class:"h1",style:"margin-top:6px"},"Практические задачи"),
      h("p",{class:"lead",style:"margin-top:8px"},"Открытые задания, как на работе: результат — документ, таблица или прототип. Проверяешь себя по чек-листу, готовые работы складываешь в портфолио.")),
    seg,
    h("div",{class:"cases"}, list.map(t=>{ const st=P.tasks[t.id]; const nc=(st?.checks||[]).filter(Boolean).length;
      return h("button",{class:"case",onclick:()=>go({name:"task",id:t.id})},
        h("span",{class:"tag"+(st?.done?" done":"")}, st?.done ? "Выполнено" : `${TRACK[t.track]} · ${LEVEL[t.level]} · ~${t.minutes} мин`),
        h("h3",null,t.title), h("p",null,t.context),
        nc ? h("span",{class:"tag"}, `Чек-лист: ${nc} / ${t.checklist.length}`) : null); }))], sidePanel());
}
function taskScreen(){
  const t = (C.tasks||[]).find(x=>x.id===route.id); if(!t) return go({name:"tasks"});
  const st = P.tasks[t.id] = Object.assign({done:false, checks:t.checklist.map(()=>false), note:""}, P.tasks[t.id]);
  if (st.checks.length !== t.checklist.length) st.checks = t.checklist.map((_,i)=>!!st.checks[i]);
  let noteTimer=null;
  const doneBtn = h("button",{class:"btn primary",onclick:()=>{
    const first=!st.done; st.done=!st.done; if(first) addXP(25+5*t.level, "Задача: "+t.title); touch(); go({name:"task",id:t.id}); }}, st.done?"Вернуть в работу":"Отметить выполненной");
  const checks = h("div",{class:"col",style:"gap:8px"}, t.checklist.map((c,i)=>{
    const id="chk-"+t.id+"-"+i;
    return h("label",{for:id,style:"display:flex;gap:10px;align-items:flex-start;cursor:pointer"},
      h("input",{type:"checkbox",id,checked:st.checks[i]?true:null,style:"margin-top:4px;width:18px;height:18px;accent-color:var(--brand)",onchange:e=>{st.checks[i]=e.target.checked; touch();}}),
      h("span",null,c)); }));
  const note = h("textarea",{id:"note-"+t.id,class:"search",rows:"6",placeholder:"Черновик ответа или ссылка на документ с решением. Сохраняется автоматически.",
    oninput:e=>{ st.note=e.target.value.slice(0,4000); clearTimeout(noteTimer); noteTimer=setTimeout(touch,700); }});
  note.value = st.note||"";
  shell([h("div",null, h("button",{class:"btn ghost",style:"padding:6px 0;border:0",onclick:()=>go({name:"tasks"})},"← Все задачи"),
      h("div",{class:"eyebrow",style:"margin-top:8px"}, `${TRACK[t.track]} · ${LEVEL[t.level]} · ~${t.minutes} мин`+(t.module!=null?` · по модулю ${t.module}`:"")),
      h("h1",{class:"h1",style:"margin-top:6px"}, t.title)),
    h("section",{class:"brief"}, h("div",{class:"eyebrow"},"Ситуация"), h("p",null,t.context)),
    h("section",{class:"panel"}, h("h2",{class:"h2",style:"margin-bottom:6px"},"Задание"), h("p",{style:"margin:0 0 10px"},t.task),
      h("div",{class:"eyebrow",style:"margin-bottom:4px"},"Что сдать"), h("p",{style:"margin:0"},t.deliverable)),
    t.hints?.length ? h("section",{class:"example"}, h("div",{class:"eyebrow"},"Подсказки"), h("ul",{style:"margin:6px 0 0;padding-left:18px"}, t.hints.map(x=>h("li",null,x)))) : null,
    h("section",{class:"panel col",style:"gap:12px"}, h("h2",{class:"h2"},"Проверь себя"), h("p",{class:"lead",style:"margin:0"},"Отметь пункты, которые выполнены в твоём решении."), checks),
    h("section",{class:"panel col",style:"gap:10px"}, h("h2",{class:"h2"},"Моё решение"), note),
    h("div",{class:"btn-row"}, doneBtn)], sidePanel());
}

/* ---------- glossary ---------- */
let glossQ = "";
function gloss(){
  const list = h("div",{class:"gloss"});
  function fill(){ const q=glossQ.trim().toLowerCase();
    const items = (C.glossary||[]).filter(({t,d})=>!q||t.toLowerCase().includes(q)||d.toLowerCase().includes(q));
    list.replaceChildren(...(items.length?items.map(({t,d})=>h("div",{class:"term"},h("b",null,t),h("p",null,d))):[h("p",{class:"lead"},"Ничего не нашлось.")])); }
  const inp = h("input",{class:"search",id:"gloss-q",type:"search",placeholder:"Найти термин: NIM, MVP, RICE…",value:glossQ,oninput:e=>{glossQ=e.target.value;fill();}});
  fill();
  shell([h("div",null,h("div",{class:"eyebrow"},`${(C.glossary||[]).length} терминов`),h("h1",{class:"h1",style:"margin-top:6px"},"Словарь продакта")), inp, list]);
}

/* ---------- admin (standalone only) ---------- */
let adminFilter = "pending";
async function admin(){
  if (!ctx.isAdmin || !store.admin) return go({name:"home"});
  const box = h("div",{class:"col"}, h("p",{class:"lead"},"Загружаю заявки…"));
  shell([h("div",null,h("div",{class:"eyebrow"},"Управление доступом"),h("h1",{class:"h1",style:"margin-top:6px"},"Админка")), box]);
  let users=[]; try { users = await store.admin.list(); } catch(e){ box.replaceChildren(h("p",{class:"lead"},"Не удалось загрузить список: "+(e.message||e))); return; }
  const counts = {pending:0,approved:0,denied:0}; users.forEach(u=>counts[u.status]=(counts[u.status]||0)+1);
  const seg = h("div",{class:"seg"}, [["pending","Ожидают"],["approved","Одобрены"],["denied","Отклонены"],["all","Все"]].map(([k,t])=>
    h("button",{"aria-pressed":String(adminFilter===k),onclick:()=>{adminFilter=k;admin();}}, t+(k!=="all"?" · "+(counts[k]||0):""))));
  const rows = users.filter(u=>adminFilter==="all"||u.status===adminFilter).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
  const label = {pending:"Ожидает",approved:"Одобрен",denied:"Отклонён"};
  async function setS(u,s){ try{ await store.admin.setStatus(u.uid,s); toast(s==="approved"?"Доступ открыт":"Доступ закрыт"); admin(); }catch(e){ toast("Не получилось: "+(e.message||e)); } }
  const table = rows.length ? h("div",{class:"scroll"}, h("table",{class:"table"},
    h("thead",null,h("tr",null,h("th",null,"Пользователь"),h("th",null,"Почта"),h("th",null,"Заявка"),h("th",null,"Статус"),h("th",null,""))),
    h("tbody",null, rows.map(u=>h("tr",null,
      h("td",null,u.name||"—"), h("td",null,u.email||"—"), h("td",{class:"num"}, u.createdAt?new Date(u.createdAt).toLocaleDateString("ru-RU"):"—"),
      h("td",null,h("span",{class:"pill "+u.status},label[u.status]||u.status)),
      h("td",null,h("div",{class:"btn-row",style:"flex-wrap:nowrap"},
        u.status!=="approved"?h("button",{class:"btn primary",style:"padding:7px 12px;font-size:13px",onclick:()=>setS(u,"approved")},"Одобрить"):null,
        u.status!=="denied"?h("button",{class:"btn",style:"padding:7px 12px;font-size:13px",onclick:()=>setS(u,"denied")},u.status==="approved"?"Закрыть доступ":"Отклонить"):null))))))) :
    h("p",{class:"lead"},"Здесь пока пусто.");
  const content = h("section",{class:"panel"}, h("h2",{class:"h2"},"Материалы курса"),
    h("p",{class:"lead",style:"margin:6px 0 12px"}, store.admin.contentInfo ? store.admin.contentInfo() : ""),
    h("label",{class:"btn",for:"content-file"},"Загрузить content.json"),
    h("input",{type:"file",id:"content-file",accept:".json,application/json",hidden:true,onchange:async e=>{
      const f=e.target.files[0]; if(!f) return; try{ const data=JSON.parse(await f.text()); await store.admin.uploadContent(data); toast("Курс загружен"); location.reload(); }catch(err){ toast("Ошибка: "+(err.message||err)); } }}));
  box.replaceChildren(h("section",{class:"panel col",style:"gap:14px"}, seg, table), content);
}

/* ---------- gates ---------- */
const G_ICON = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
function adminForm(onSubmit){
  const det = h("details",{style:"border-top:1px solid var(--line);padding-top:12px"});
  const err = h("div",{class:"notice",hidden:true});
  const login = h("input",{class:"search",id:"adm-login",autocomplete:"username",placeholder:"Логин",required:true});
  const pass = h("input",{class:"search",id:"adm-pass",type:"password",autocomplete:"current-password",placeholder:"Пароль",required:true});
  const btn = h("button",{class:"btn primary",type:"submit"},"Войти");
  const form = h("form",{class:"col",style:"gap:10px;margin-top:10px",onsubmit:async e=>{
    e.preventDefault(); err.hidden=true; btn.disabled=true;
    try { await onSubmit(login.value.trim(), pass.value); }
    catch(ex){ err.textContent = ex && ex.message ? ex.message : String(ex); err.hidden=false; btn.disabled=false; }
  }}, login, pass, btn, err);
  det.append(h("summary",{style:"cursor:pointer;color:var(--muted);font-size:14px"},"Вход для администратора"), form);
  return det;
}
function gate(kind, extra){
  const bar = h("header",{class:"bar"}, h("div",{class:"bar-in"}, h("span",{class:"logo"}, h("i",null,"PM"), h("b",null,"Путь продакта"))));
  let body;
  if (kind==="login"){
    const g = h("button",{class:"gbtn",onclick:extra.signIn}); g.innerHTML = G_ICON; g.append("Войти через Google");
    body = h("div",{class:"auth panel"}, h("div",{class:"eyebrow"},"Курс для будущих продактов в банке"), h("h1",{class:"h1"},"Вход"),
      h("p",{class:"lead"},"Войди через Google. Доступ к урокам открывает администратор: после первого входа твоя заявка попадёт к нему на одобрение."), g,
      extra.error ? h("div",{class:"notice"}, extra.error) : null,
      extra.adminSignIn ? adminForm(extra.adminSignIn) : null);
  } else if (kind==="pending"){
    body = h("div",{class:"auth panel"}, h("span",{class:"pill pending",style:"align-self:flex-start"},"Заявка на рассмотрении"), h("h1",{class:"h1"},"Почти готово"),
      h("p",{class:"lead"}, `Ты вошёл как ${extra.email||"пользователь"}. Администратор получил заявку. Как только доступ одобрят, обнови страницу.`),
      h("div",{class:"btn-row"}, h("button",{class:"btn primary",onclick:()=>location.reload()},"Проверить снова"), h("button",{class:"btn",onclick:extra.signOut},"Выйти")));
  } else if (kind==="denied"){
    body = h("div",{class:"auth panel"}, h("span",{class:"pill denied",style:"align-self:flex-start"},"Доступ закрыт"), h("h1",{class:"h1"},"Нет доступа"),
      h("p",{class:"lead"},"Администратор не открыл доступ для этого аккаунта. Если это ошибка, свяжись с ним напрямую."), h("button",{class:"btn",onclick:extra.signOut},"Выйти"));
  } else if (kind==="nocontent"){
    body = h("div",{class:"auth panel"}, h("h1",{class:"h1"},"Курс ещё не загружен"), h("p",{class:"lead"},"Администратор пока не загрузил материалы. Загляни позже."), h("button",{class:"btn",onclick:extra.signOut},"Выйти"));
  } else {
    body = h("div",{class:"auth panel"}, h("p",{class:"lead"},"Загрузка…"));
  }
  $app.replaceChildren(bar, h("main",{class:"wrap"}, h("div",{class:"center"}, body)));
}

/* ---------- render ---------- */
function render(){
  setKeys(null);
  const r = {home, learn, module:moduleScreen, lesson:lessonScreen, trainer, case:caseScreen, tasks:tasksScreen, task:taskScreen, review, blitz, gloss, admin}[route.name] || home;
  r();
}
render.sideOnly = function(){ const s=document.querySelector(".side"); if(s) s.replaceChildren(...sidePanel()); const nav=document.querySelector(".nav"); if(nav){ /* refresh mistakes count lazily on next render */ } };

function softRender(){ // never interrupt a running quiz or case
  if (["home","learn","module","trainer","gloss","review","blitz","tasks"].includes(route.name) && !document.querySelector(".opt")) render();
  else render.sideOnly();
}
/* ---------- boot ---------- */
window.APP = {
  gate,
  start(opts){
    indexCourse(opts.course); store = opts.store; ctx = Object.assign(ctx, opts.ctx||{});
    P = merge(blank(), opts.progress || null);
    render();
  },
  attachStore(newStore, remote, note){ // late-arriving store (claude.ai): merge and keep going
    store = newStore; ctx.syncNote = note || ctx.syncNote;
    P = merge(P, remote); dirty = true; flush(); softRender();
  },
  flush,
  go,
  setUser(u){ ctx.user = Object.assign({}, ctx.user||{}, u); softRender(); }
};
window.addEventListener("pagehide", ()=>{ flush(); });
})();
