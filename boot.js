/* Отдельный сайт: вход через Google (Firebase Auth), заявки на доступ и прогресс (Firestore) */
(function(){
  var cfg = window.FIREBASE_CONFIG;
  if (!cfg || !cfg.apiKey || cfg.apiKey.indexOf("ВСТАВЬ") === 0) {
    APP.gate("login", { signIn: function(){}, error: "Сайт ещё не подключён к Firebase: заполни файл firebase-config.js по инструкции из README." });
    return;
  }
  firebase.initializeApp(cfg);
  var auth = firebase.auth(), fs = firebase.firestore();
  var provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  function signIn(){
    auth.signInWithPopup(provider).catch(function(e){
      if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return auth.signInWithRedirect(provider);
      APP.gate("login", { signIn: signIn, error: "Не удалось войти: " + (e && e.message ? e.message : e) });
    });
  }
  function signOut(){ return auth.signOut().then(function(){ location.reload(); }); }
  APP.gate("loading");

  auth.onAuthStateChanged(async function(u){
    if (!u) { APP.gate("login", { signIn: signIn }); return; }
    try {
      var users = fs.collection("users");
      var isAdmin = false;
      try { await users.limit(1).get(); isAdmin = true; } catch(e) {}
      var uref = users.doc(u.uid);
      var snap = await uref.get();
      if (!snap.exists) {
        await uref.set({ email: u.email || "", name: u.displayName || "", status: isAdmin ? "approved" : "pending", createdAt: Date.now() });
        snap = await uref.get();
      }
      var status = snap.data().status;
      if (!isAdmin && status === "pending") { APP.gate("pending", { email: u.email, signOut: signOut }); return; }
      if (!isAdmin && status !== "approved") { APP.gate("denied", { signOut: signOut }); return; }

      var course = { modules: [], glossary: [], tasks: [] };
      var cs = await fs.collection("content").get();
      cs.forEach(function(d){ if (d.id === "meta") { course.glossary = d.data().glossary || []; course.tasks = d.data().tasks || []; } else course.modules.push(d.data()); });
      if (!course.modules.length && !isAdmin) { APP.gate("nocontent", { signOut: signOut }); return; }

      var pref = fs.collection("progress").doc(u.uid);
      var prog = null; try { var ps = await pref.get(); prog = ps.exists ? ps.data() : null; } catch(e) {}

      var adminApi = isAdmin ? {
        list: async function(){ var q = await users.get(); return q.docs.map(function(d){ var x = d.data(); x.uid = d.id; return x; }); },
        setStatus: function(uid, s){ return users.doc(uid).update({ status: s, decidedAt: Date.now() }); },
        contentInfo: function(){ return course.modules.length ? ("Загружено модулей: " + course.modules.length + ". Чтобы обновить материалы, загрузи новый content.json — он заменит текущие.") : "Материалы ещё не загружены. Загрузи файл content.json из папки сайта — без него ученики увидят экран «Курс ещё не загружен»."; },
        uploadContent: async function(data){
          if (!data || !Array.isArray(data.modules)) throw new Error("в файле нет списка modules");
          var batch = fs.batch(), col = fs.collection("content");
          var old = await col.get(); old.forEach(function(d){ batch.delete(d.ref); });
          data.modules.forEach(function(m){ batch.set(col.doc("m" + m.module), m); });
          batch.set(col.doc("meta"), { glossary: data.glossary || [], tasks: data.tasks || [], updatedAt: Date.now() });
          await batch.commit();
        }
      } : null;

      APP.start({
        course: course,
        store: { save: function(p){ return pref.set(p); }, admin: adminApi },
        progress: prog,
        ctx: { user: { name: u.displayName || "", email: u.email || "" }, isAdmin: isAdmin, signOut: signOut, syncNote: "Прогресс сохраняется в твоём аккаунте Google и доступен с любого устройства." }
      });
      if (isAdmin && !course.modules.length) APP.go({ name: "admin" });
    } catch(e) {
      APP.gate("login", { signIn: signIn, error: "Ошибка подключения: " + (e && e.message ? e.message : e) });
    }
  });
})();
