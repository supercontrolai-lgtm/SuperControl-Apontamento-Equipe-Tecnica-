import { useState, useEffect } from "react";

// ═══════════════════════════════════════════════════════════════════════════════
// FIREBASE CONFIG — substitua pelos seus valores do console.firebase.google.com
// Projeto: supercontrol-data
// ═══════════════════════════════════════════════════════════════════════════════
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyD_WOPcq-XGfnW-xpebiqcei0ynH-Qfc_w",
  authDomain:        "supercontrol-data-6725c.firebaseapp.com",
  projectId:         "supercontrol-data-6725c",
  storageBucket:     "supercontrol-data-6725c.firebasestorage.app",
  messagingSenderId: "978341472258",
  appId:             "1:978341472258:web:0754b30aae6ddabcbedf1b",
};

const USE_FIREBASE = FIREBASE_CONFIG.apiKey !== "COLE_SUA_API_KEY_AQUI";

// ═══════════════════════════════════════════════════════════════════════════════
// FIREBASE SDK
// ═══════════════════════════════════════════════════════════════════════════════
let db = null;
let firebaseReady = false;

async function initFirebase() {
  if (firebaseReady) return true;
  try {
    const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
    const { getFirestore, collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy } =
      await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const app = getApps().length === 0 ? initializeApp(FIREBASE_CONFIG) : getApps()[0];
    db = getFirestore(app);
    window._fb = { collection, addDoc, getDocs, deleteDoc, doc, query, where, orderBy };
    firebaseReady = true;
    return true;
  } catch { return false; }
}

async function fbGetPvs() {
  const { collection, getDocs } = window._fb;
  const snap = await getDocs(collection(db, "pvs"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function fbSaveEntry(entry) {
  const { collection, addDoc } = window._fb;
  const ref = await addDoc(collection(db, "apontamentos"), entry);
  return ref.id;
}
async function fbGetMyEntries(workerName) {
  const { collection, getDocs, query, where, orderBy } = window._fb;
  const q = query(collection(db, "apontamentos"), where("workerName", "==", workerName), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function fbDeleteEntry(id) {
  const { doc, deleteDoc } = window._fb;
  await deleteDoc(doc(db, "apontamentos", id));
}
async function fbGetUsuarios() {
  const { collection, getDocs } = window._fb;
  const snap = await getDocs(collection(db, "usuarios"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function fbGetEntriesByPvDisciplina(pvId, disciplina) {
  const { collection, getDocs, query, where } = window._fb;
  const q = query(collection(db, "apontamentos"), where("pvId", "==", pvId), where("disciplina", "==", disciplina));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function fbGetBudget(pvId, disciplina) {
  const { collection, getDocs, query, where } = window._fb;
  const q = query(collection(db, "budgets"), where("pvId", "==", pvId), where("disciplina", "==", disciplina));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ─── FALLBACK LOCAL ───────────────────────────────────────────────────────────
function localGet(key) {
  try { const v = localStorage.getItem("sc_" + key); return v ? JSON.parse(v) : null; } catch { return null; }
}
function localSet(key, value) {
  try { localStorage.setItem("sc_" + key, JSON.stringify(value)); return true; } catch { return false; }
}

const SEED_PVS = [
  { id: "seed-001", code: "4800", name: "Reforma Elétrica Bloco A", active: true },
  { id: "seed-002", code: "4900", name: "Instalação Solar Unidade II", active: true },
  { id: "seed-003", code: "5000", name: "Manutenção Preventiva Geral", active: true },
];

// ─── UTILITÁRIOS ─────────────────────────────────────────────────────────────
function toMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
function calcHoursDecimal(entrada, saida, almIni, almFim) {
  const total = toMin(saida) - toMin(entrada);
  const alm = almIni && almFim ? toMin(almFim) - toMin(almIni) : 0;
  return Math.max(0, (total - alm) / 60);
}
function calcHoursLabel(entrada, saida, almIni, almFim) {
  const dec = calcHoursDecimal(entrada, saida, almIni, almFim);
  if (dec <= 0) return null;
  const h = Math.floor(dec); const m = Math.round((dec - h) * 60);
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}
function today() { return new Date().toISOString().split("T")[0]; }
function fmtDate(d) {
  if (!d) return ""; const [y, m, day] = d.split("-"); return `${day}/${m}/${y}`;
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function validarJanelaRegistro(date, saida) {
  const agora = new Date();
  const hoje = agora.toISOString().split("T")[0];
  const ontem = new Date(agora - 86400000).toISOString().split("T")[0];

  // Data do apontamento só pode ser hoje ou ontem
  if (date !== hoje && date !== ontem) {
    return { ok: false, msg: "Registro fora do prazo. Só é permitido registrar o dia atual ou o dia anterior até meia-noite." };
  }

  // Se for ontem, verifica se ainda está dentro da janela (até meia-noite de hoje)
  if (date === ontem) {
    // Meia-noite de hoje = sempre ok se ainda for o mesmo dia
    return { ok: true };
  }

  // Se for hoje, horário atual tem que ser >= horário de saída
  const [hSaida, mSaida] = saida.split(":").map(Number);
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes();
  const minutosSaida = hSaida * 60 + mSaida;

  if (minutosAgora < minutosSaida) {
    const diff = minutosSaida - minutosAgora;
    const h = Math.floor(diff / 60);
    const m = diff % 60;
    const falta = h > 0 ? `${h}h ${m}min` : `${m}min`;
    return { ok: false, msg: `Registro antecipado não permitido. Aguarde o horário de saída (${saida}). Faltam ${falta}.` };
  }

  return { ok: true };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DESIGN — SuperControl: preto, vermelho, cinza, branco
// ═══════════════════════════════════════════════════════════════════════════════
const C = {
  bg:       "#141414",   // fundo principal — preto profundo
  surface:  "#1E1E1E",   // topbar e superfícies
  card:     "#222222",   // cards
  border:   "#333333",   // bordas
  fieldBg:  "#1A1A1A",   // fundo dos inputs
  red:      "#D42B2B",   // vermelho SuperControl
  redDim:   "#A82222",   // vermelho escuro (hover)
  redGlow:  "#D42B2B22", // vermelho transparente
  text:     "#F0F0F0",   // texto principal — branco suave
  muted:    "#888888",   // texto secundário — cinza
  faint:    "#555555",   // cinza escuro
  success:  "#4CAF7D",   // verde confirmação
  danger:   "#D42B2B",   // vermelho erro (mesmo red)
};

const S = {
  app: {
    minHeight: "100vh",
    background: C.bg,
    color: C.text,
    fontFamily: "'Inter', system-ui, sans-serif",
  },
  topbar: {
    background: C.surface,
    borderBottom: `1px solid ${C.border}`,
    boxShadow: `0 3px 0 0 ${C.red}`,  // linha vermelha — assinatura visual
    padding: "14px 20px",
    display: "flex", alignItems: "center", justifyContent: "space-between",
  },
  logoWrap: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: {
    width: 28, height: 28, background: C.red, borderRadius: 6,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 14, fontWeight: 900, color: "#fff", letterSpacing: "-1px",
  },
  logoText: { fontWeight: 800, fontSize: 16, color: C.text, letterSpacing: "-0.3px" },
  logoSub:  { fontSize: 11, color: C.muted, fontWeight: 400 },
  page: { maxWidth: 500, margin: "0 auto", padding: "24px 16px" },
  card: {
    background: C.card, border: `1px solid ${C.border}`,
    borderRadius: 10, padding: "20px", marginBottom: 14,
  },
  label: {
    fontSize: 11, fontWeight: 700, color: C.muted,
    textTransform: "uppercase", letterSpacing: "0.8px",
    marginBottom: 6, display: "block",
  },
  input: {
    width: "100%", background: C.fieldBg, border: `1px solid ${C.border}`,
    borderRadius: 7, padding: "11px 13px", color: C.text, fontSize: 15,
    outline: "none", boxSizing: "border-box", transition: "border-color .15s",
  },
  select: {
    width: "100%", background: C.fieldBg, border: `1px solid ${C.border}`,
    borderRadius: 7, padding: "11px 13px", color: C.text, fontSize: 15,
    outline: "none", boxSizing: "border-box", cursor: "pointer",
  },
  btn: (v = "primary") => ({
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 7,
    padding: "12px 22px", borderRadius: 7, border: "none", cursor: "pointer",
    fontWeight: 700, fontSize: 14, letterSpacing: "0.1px",
    background: v === "primary" ? C.red
               : v === "outline" ? "transparent"
               : v === "ghost"   ? "transparent"
               : C.border,
    color: v === "primary" ? "#fff"
         : v === "outline" ? C.red
         : v === "ghost"   ? C.muted
         : C.text,
    border: v === "outline" ? `1px solid ${C.red}`
          : v === "ghost"   ? `1px solid ${C.border}`
          : "none",
  }),
  row:     { display: "flex", gap: 12 },
  divider: { border: "none", borderTop: `1px solid ${C.border}`, margin: "16px 0" },
  h1:   { fontSize: 22, fontWeight: 800, color: C.text, margin: 0 },
  h3:   { fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.5px" },
  muted:{ color: C.muted, fontSize: 13 },
};

// ═══════════════════════════════════════════════════════════════════════════════
// APP
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [step, setStep] = useState("name"); // name | form | done | report
  const [workerName, setWorkerName] = useState("");
  const [pvs, setPvs] = useState([]);
  const [myEntries, setMyEntries] = useState([]);
  const [nameError, setNameError] = useState("");
  const [lastEntry, setLastEntry] = useState(null);
  const [form, setForm] = useState({ date: today(), pvId: "", disciplina: "", entrada: "07:00", saida: "17:00", almIni: "12:00", almFim: "13:00", obs: "", semComentario: false });
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dbMode, setDbMode] = useState("local");
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    async function init() {
      if (USE_FIREBASE) {
        const ok = await initFirebase();
        if (ok) {
          setDbMode("firebase");
          try {
            const [us] = await Promise.all([fbGetUsuarios()]);
            setUsuarios(us);
          } catch {}
          try { setPvs((await fbGetPvs()).filter(p => p.active)); }
          catch { setPvs([]); }
        } else { loadLocalPvs(); }
      } else { loadLocalPvs(); }
      // Verifica se já tem nome salvo no celular
      const savedName = localStorage.getItem("sc_worker_name");
      if (savedName) {
        // Revalida se ainda está cadastrado
        const us = dbMode === "firebase" ? [] : (localGet("usuarios") || []);
        const ainda = us.length === 0 || us.some(u => u.nome.toLowerCase() === savedName.toLowerCase());
        if (!ainda) {
          localStorage.removeItem("sc_worker_name");
        } else {
          setWorkerName(savedName);
        // carrega histórico do cara direto
        const allLocal = localStorage.getItem("sc_entries");
        const allEntries = allLocal ? JSON.parse(allLocal) : [];
        const mine = allEntries
          .filter(e => e.workerName.toLowerCase() === savedName.toLowerCase())
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 8);
        setMyEntries(mine);
          setStep("form");
        }
      }
      setLoading(false);
    }
    init();
  }, []);

  function loadLocalPvs() {
    if (!localGet("pvs")) localSet("pvs", SEED_PVS);
    if (!localGet("entries")) localSet("entries", []);
    setUsuarios(localGet("usuarios") || []);
    const budgets = localGet("budgets") || [];
    const discs = ["Projeto Elétrico","Montagem de Painéis","Desenvolvimento de Software","Instalação de Campo","Comissionamento e Startup"];
    const validos = (localGet("pvs") || []).filter(p => {
      if (!p.active) return false;
      if (p.status && p.status !== "ativo") return false; // só projetos ativos
      return discs.every(d => budgets.some(b => b.pvId === p.id && b.disciplina === d));
    });
    setPvs(validos);
  }

  async function loadMyEntries(name) {
    if (dbMode === "firebase") {
      try { setMyEntries((await fbGetMyEntries(name)).slice(0, 8)); }
      catch { setMyEntries([]); }
    } else {
      const all = localGet("entries") || [];
      setMyEntries(
        all.filter(e => e.workerName.toLowerCase() === name.toLowerCase())
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8)
      );
    }
  }

  function handleName() {
    const nome = workerName.trim();
    if (!nome) { setNameError("Informe seu nome completo"); return; }
    // Valida se o usuário está cadastrado no sistema
    if (usuarios.length > 0) {
      const encontrado = usuarios.find(u => u.nome.toLowerCase() === nome.toLowerCase());
      if (!encontrado) {
        setNameError("Usuário não encontrado. Solicite seu cadastro ao gestor.");
        return;
      }
    }
    localStorage.setItem("sc_worker_name", nome);
    loadMyEntries(nome);
    setStep("form");
  }

  function setF(field, val) {
    setForm(p => ({ ...p, [field]: val }));
    setFormErrors(p => { const n = { ...p }; delete n[field]; delete n.horario; delete n.janela; delete n.obs; return n; });

  }


  function validate() {
    const e = {};
    if (!form.pvId) e.pvId = "Selecione o projeto";
    const hrs = calcHoursDecimal(form.entrada, form.saida, form.almIni, form.almFim);
    if (!form.entrada || !form.saida || hrs <= 0) e.horario = "Horário inválido";
    else if (hrs > 16) e.horario = "Mais de 16h? Confira os horários";
    if (!form.disciplina) e.disciplina = "Selecione a disciplina";
    if (!form.semComentario && (!form.obs || form.obs.trim().length < 5)) {
      e.obs = "Escreva uma observação ou marque que não tem comentários";
    }
    return e;
  }

  async function handleSave() {
    const e = validate();
    if (Object.keys(e).length) { setFormErrors(e); return; }

    // Validar janela de registro
    const janela = validarJanelaRegistro(form.date, form.saida);
    if (!janela.ok) {
      setFormErrors({ janela: janela.msg });
      return;
    }

    setSaving(true);
    const pv = pvs.find(p => p.id === form.pvId);
    const entry = {
      workerName: workerName.trim(), date: form.date,
      pvId: form.pvId, pvCode: pv?.code || "", pvName: pv?.name || "",
      disciplina: form.disciplina,
      entrada: form.entrada, saida: form.saida, almIni: form.almIni, almFim: form.almFim,
      hours: calcHoursDecimal(form.entrada, form.saida, form.almIni, form.almFim),
      hoursLabel: calcHoursLabel(form.entrada, form.saida, form.almIni, form.almFim),
      obs: form.semComentario ? "" : form.obs,
      semComentario: form.semComentario,
      createdAt: new Date().toISOString(),
    };
    try {
      if (dbMode === "firebase") {
        entry.id = await fbSaveEntry(entry);
      } else {
        entry.id = uid();
        const all = localGet("entries") || [];
        localSet("entries", [entry, ...all]);
      }
      setLastEntry(entry);
      setMyEntries(p => [entry, ...p].slice(0, 8));
      setStep("done");
    } catch (err) {
      setFormErrors({ save: "Erro ao salvar. Tente novamente." });
    }
    setSaving(false);
  }

  async function handleDeleteEntry(entry) {
    try {
      if (dbMode === "firebase") await fbDeleteEntry(entry.id);
      else {
        const all = localGet("entries") || [];
        localSet("entries", all.filter(e => e.id !== entry.id));
      }
      setMyEntries(p => p.filter(e => e.id !== entry.id));
      if (lastEntry?.id === entry.id) setLastEntry(null);
    } catch {}
  }

  const previewHrs = form.entrada && form.saida
    ? calcHoursLabel(form.entrada, form.saida, form.almIni, form.almFim) : null;

  if (step === "report") return (
    <ReportView
      workerName={workerName}
      pvs={pvs}
      dbMode={dbMode}
      onBack={() => setStep("form")}
    />
  );

  // ── LOADING ──
  if (loading) return (
    <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
      <div style={{ ...S.logoIcon, width: 48, height: 48, fontSize: 22, borderRadius: 12 }}>SC</div>
      <div style={{ color: C.muted, fontSize: 14 }}>Conectando...</div>
    </div>
  );

  // ── TELA: NOME ──
  if (step === "name") return (
    <div style={S.app}>
      <Topbar dbMode={dbMode} />
      <div style={{ ...S.page, paddingTop: 48 }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.red, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: 10 }}>
            SuperApontamento Equipe Técnica
          </div>
          <h1 style={S.h1}>Registro de<br />Horas Trabalhadas</h1>
          <p style={{ ...S.muted, marginTop: 8 }}>Informe seu nome para iniciar o apontamento</p>
        </div>
        <div style={S.card}>
          <label style={S.label}>Nome completo</label>
          <input
            style={{ ...S.input, borderColor: nameError ? C.red : C.border }}
            placeholder="Ex: João Silva"
            value={workerName}
            onChange={e => { setWorkerName(e.target.value); setNameError(""); }}
            onKeyDown={e => e.key === "Enter" && handleName()}
          />
          {nameError && <div style={{ color: C.red, fontSize: 12, marginTop: 6 }}>{nameError}</div>}
          <button style={{ ...S.btn("primary"), width: "100%", marginTop: 16, padding: "14px" }} onClick={handleName}>
            Continuar →
          </button>
        </div>
      </div>
    </div>
  );

  // ── TELA: CONFIRMAÇÃO ──
  if (step === "done") return (
    <div style={S.app}>
      <Topbar dbMode={dbMode} worker={workerName.split(" ")[0]} />
      <div style={S.page}>
        <div style={{ ...S.card, textAlign: "center", padding: "32px 20px", borderTop: `3px solid ${C.success}` }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Apontamento gravado!</div>
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 4 }}>
            PV {lastEntry?.pvCode} — {lastEntry?.pvName}
          </div>
          <div style={{ color: C.muted, fontSize: 13, marginBottom: 16 }}>{fmtDate(lastEntry?.date)}</div>
          <div style={{
            background: C.redGlow, border: `1px solid ${C.red}44`,
            borderRadius: 8, padding: "12px 20px", marginBottom: 20, display: "inline-block"
          }}>
            <span style={{ color: C.red, fontWeight: 900, fontSize: 28 }}>{lastEntry?.hoursLabel}</span>
            <div style={{ color: C.muted, fontSize: 11, marginTop: 2 }}>HORAS REGISTRADAS</div>
          </div>
          <div style={S.row}>
            <button style={{ ...S.btn("ghost"), flex: 1 }}
              onClick={() => { setForm({ date: today(), pvId: "", disciplina: "", entrada: "07:00", saida: "17:00", almIni: "12:00", almFim: "13:00", obs: "", semComentario: false }); setStep("form"); }}>
              + Novo
            </button>
            <button style={{ ...S.btn("primary"), flex: 1 }} onClick={() => setStep("name")}>Sair</button>
          </div>
        </div>

        {myEntries.length > 0 && (
          <div style={S.card}>
            <div style={S.h3}>Histórico Recente</div>
            {myEntries.map(e => <EntryRow key={e.id} entry={e} onDelete={handleDeleteEntry} />)}
          </div>
        )}
      </div>
    </div>
  );

  // ── TELA: FORMULÁRIO ──
  return (
    <div style={S.app}>
      <Topbar dbMode={dbMode} worker={workerName.split(" ")[0]} onBack={() => setStep("name")} />
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.h3}>Novo Apontamento</div>

          <label style={S.label}>Data</label>
          <input style={{ ...S.input, marginBottom: 14 }} type="date" value={form.date}
            onChange={e => setF("date", e.target.value)} />

          <label style={S.label}>Projeto (PV)</label>
          <select style={{ ...S.select, marginBottom: formErrors.pvId ? 4 : 14, borderColor: formErrors.pvId ? C.red : C.border }}
            value={form.pvId} onChange={e => setF("pvId", e.target.value)}>
            <option value="">— Selecione o projeto —</option>
            {pvs.map(p => <option key={p.id} value={p.id}>PV {p.code} · {p.name}</option>)}
          </select>
          {formErrors.pvId && <div style={{ color: C.red, fontSize: 12, marginBottom: 10 }}>{formErrors.pvId}</div>}

          <label style={S.label}>Disciplina <span style={{ color: C.red }}>*</span></label>
          <select
            style={{ ...S.select, marginBottom: formErrors.disciplina ? 4 : 14, borderColor: formErrors.disciplina ? C.red : C.border }}
            value={form.disciplina}
            onChange={e => setF("disciplina", e.target.value)}
          >
            <option value="">— Selecione a disciplina —</option>
            <option value="Projeto Elétrico">Projeto Elétrico</option>
            <option value="Montagem de Painéis">Montagem de Painéis</option>
            <option value="Desenvolvimento de Software">Desenvolvimento de Software</option>
            <option value="Instalação de Campo">Instalação de Campo</option>
            <option value="Comissionamento e Startup">Comissionamento e Startup</option>
          </select>
          {formErrors.disciplina && <div style={{ color: C.red, fontSize: 12, marginBottom: 10 }}>{formErrors.disciplina}</div>}

          {/* CAMPO OBSERVAÇÕES */}
          <div style={{ background: C.surface, border:`1px solid ${C.border}`, borderRadius:8, padding:"14px", marginBottom:14 }}>
            <div style={{ fontSize:13, color:C.text, fontWeight:600, marginBottom:10 }}>
              💬 Tem algo que queira registrar sobre o projeto?
            </div>
            <div style={{ fontSize:12, color:C.muted, marginBottom:12 }}>
              Problemas encontrados, sugestões de melhoria, algo que atrapalhou o andamento ou qualquer observação relevante.
            </div>

            {/* Checkbox: sem comentários */}
            <div
              onClick={() => setF("semComentario", !form.semComentario)}
              style={{ display:"flex", alignItems:"center", gap:10, cursor:"pointer", marginBottom: form.semComentario ? 0 : 12 }}
            >
              <div style={{
                width:20, height:20, borderRadius:4, flexShrink:0,
                border:`2px solid ${form.semComentario ? C.success : C.border}`,
                background: form.semComentario ? C.success : "transparent",
                display:"flex", alignItems:"center", justifyContent:"center",
                transition:"all .15s"
              }}>
                {form.semComentario && <span style={{ color:"#fff", fontSize:13, fontWeight:900 }}>✓</span>}
              </div>
              <span style={{ fontSize:13, color: form.semComentario ? C.success : C.muted }}>
                Não tenho nenhum comentário no momento
              </span>
            </div>

            {/* Campo de texto — aparece se não marcou sem comentário */}
            {!form.semComentario && (
              <>
                <textarea
                  style={{ ...S.input, resize:"none", height:80, lineHeight:1.5, borderColor: formErrors.obs ? C.red : C.border }}
                  placeholder="Descreva aqui um problema, sugestão ou observação..."
                  maxLength={300}
                  value={form.obs}
                  onChange={e => setF("obs", e.target.value)}
                />
                {formErrors.obs && <div style={{ color:C.red, fontSize:12, marginTop:5 }}>{formErrors.obs}</div>}
              </>
            )}
          </div>

          <hr style={S.divider} />
          <div style={{ ...S.h3, marginBottom: 10 }}>Horário de Trabalho</div>

          <div style={{ ...S.row, marginBottom: formErrors.horario ? 4 : 14 }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Entrada</label>
              <input style={S.input} type="time" value={form.entrada} onChange={e => setF("entrada", e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Saída</label>
              <input style={S.input} type="time" value={form.saida} onChange={e => setF("saida", e.target.value)} />
            </div>
          </div>
          {formErrors.horario && <div style={{ color: C.red, fontSize: 12, marginBottom: 10 }}>{formErrors.horario}</div>}

          <div style={{ ...S.row, marginBottom: 14 }}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Almoço início</label>
              <input style={S.input} type="time" value={form.almIni} onChange={e => setF("almIni", e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Almoço fim</label>
              <input style={S.input} type="time" value={form.almFim} onChange={e => setF("almFim", e.target.value)} />
            </div>
          </div>

          {previewHrs && !formErrors.horario && (
            <div style={{ background: C.redGlow, border: `1px solid ${C.red}33`, borderRadius: 7, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: C.muted, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.5px" }}>Total previsto</span>
              <span style={{ color: C.red, fontWeight: 800, fontSize: 18 }}>{previewHrs}</span>
            </div>
          )}

          {formErrors.save && <div style={{ color: C.red, fontSize: 13, marginBottom: 10 }}>{formErrors.save}</div>}
          {formErrors.janela && (
            <div style={{ background: C.red+"18", border:`1px solid ${C.red}44`, borderRadius:8, padding:"12px 14px", marginBottom:12 }}>
              <div style={{ color: C.red, fontSize: 13, fontWeight: 700, marginBottom: 4 }}>⏰ Registro não permitido</div>
              <div style={{ color: C.red, fontSize: 12 }}>{formErrors.janela}</div>
            </div>
          )}

          <button style={{ ...S.btn("primary"), width: "100%", padding: "14px", fontSize: 15 }}
            onClick={handleSave} disabled={saving}>
            {saving ? "Gravando..." : "💾  Gravar Apontamento"}
          </button>
          <button style={{ ...S.btn("ghost"), width: "100%", marginTop: 10 }}
            onClick={() => setStep("report")}>
            📊  Ver Consumo de Horas
          </button>
        </div>

        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <button onClick={() => {
            localStorage.removeItem("sc_worker_name");
            setWorkerName("");
            setMyEntries([]);
            setStep("name");
          }} style={{ background: "none", border: "none", color: C.faint, cursor: "pointer", fontSize: 12 }}>
            Não sou {workerName.split(" ")[0]}? Trocar nome
          </button>
        </div>

        {myEntries.length > 0 && (
          <div style={S.card}>
            <div style={S.h3}>Histórico Recente</div>
            {myEntries.map(e => <EntryRow key={e.id} entry={e} onDelete={handleDeleteEntry} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TOPBAR ──────────────────────────────────────────────────────────────────
function Topbar({ dbMode, worker, onBack }) {
  return (
    <div style={S.topbar}>
      <div style={S.logoWrap}>
        {onBack ? (
          <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: 0, marginRight: 4 }}>← Sair</button>
        ) : (
          <div style={S.logoIcon}>SC</div>
        )}
        <div>
          <div style={S.logoText}>SuperApontamento Equipe Técnica</div>
          {worker && <div style={S.logoSub}>{worker}</div>}
        </div>
      </div>
      <div style={{ fontSize: 11, color: dbMode === "firebase" ? C.success : C.faint, fontWeight: 600 }}>
        {dbMode === "firebase" ? "● ONLINE" : "● LOCAL"}
      </div>
    </div>
  );
}

// ─── REPORT VIEW ─────────────────────────────────────────────────────────────
const DISCIPLINAS = [
  "Projeto Elétrico",
  "Montagem de Painéis",
  "Desenvolvimento de Software",
  "Instalação de Campo",
  "Comissionamento e Startup",
];

function ReportView({ workerName, pvs, dbMode, onBack }) {
  const [selPv, setSelPv] = useState("");
  const [selDisc, setSelDisc] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  async function buscar() {
    if (!selPv || !selDisc) { setErro("Selecione o projeto e a disciplina"); return; }
    setErro(""); setLoading(true); setResult(null);
    try {
      let entries = [];
      let budget = null;
      if (dbMode === "firebase") {
        entries = await fbGetEntriesByPvDisciplina(selPv, selDisc);
        budget = await fbGetBudget(selPv, selDisc);
      } else {
        const all = JSON.parse(localStorage.getItem("sc_entries") || "[]");
        entries = all.filter(e => e.pvId === selPv && e.disciplina === selDisc);
        const budgets = JSON.parse(localStorage.getItem("sc_budgets") || "[]");
        budget = budgets.find(b => b.pvId === selPv && b.disciplina === selDisc) || null;

        // SIMULAÇÃO — remove quando tiver Firebase real
        if (entries.length === 0 && !budget) {
          budget = { horasVendidas: 100 };
          entries = [
            { workerName: workerName, hours: 18.5, pvId: selPv, disciplina: selDisc },
            { workerName: "Fernando Costa", hours: 24.0, pvId: selPv, disciplina: selDisc },
            { workerName: "Marcos Lima", hours: 12.0, pvId: selPv, disciplina: selDisc },
          ];
        }
      }
      // Agrupa por colaborador
      const byWorker = {};
      entries.forEach(e => {
        if (!byWorker[e.workerName]) byWorker[e.workerName] = 0;
        byWorker[e.workerName] += e.hours || 0;
      });
      const totalConsumido = Object.values(byWorker).reduce((s, h) => s + h, 0);
      const horasVendidas = budget?.horasVendidas || null;
      const pv = pvs.find(p => p.id === selPv);
      setResult({ byWorker, totalConsumido, horasVendidas, pvCode: pv?.code, pvName: pv?.name, disciplina: selDisc });
    } catch (e) {
      setErro("Erro ao buscar dados.");
    }
    setLoading(false);
  }

  const pct = result && result.horasVendidas
    ? Math.min(100, (result.totalConsumido / result.horasVendidas) * 100) : null;
  const restante = result && result.horasVendidas
    ? result.horasVendidas - result.totalConsumido : null;
  const barColor = pct >= 90 ? C.red : pct >= 70 ? "#F4A226" : C.success;
  const myHours = result ? (result.byWorker[workerName] || 0) : 0;

  return (
    <div style={S.app}>
      <div style={S.topbar}>
        <div style={S.logoWrap}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, padding: 0, marginRight: 4 }}>← Voltar</button>
          <div>
            <div style={S.logoText}>Consumo de Horas</div>
            <div style={S.logoSub}>{workerName.split(" ")[0]}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: C.faint, fontWeight: 600 }}>📊</div>
      </div>
      <div style={S.page}>
        <div style={S.card}>
          <div style={S.h3}>Selecionar Projeto</div>
          <label style={S.label}>Projeto (PV)</label>
          <select style={{ ...S.select, marginBottom: 12 }} value={selPv} onChange={e => { setSelPv(e.target.value); setResult(null); }}>
            <option value="">— Selecione —</option>
            {pvs.map(p => <option key={p.id} value={p.id}>PV {p.code} · {p.name}</option>)}
          </select>
          <label style={S.label}>Disciplina</label>
          <select style={{ ...S.select, marginBottom: 12 }} value={selDisc} onChange={e => { setSelDisc(e.target.value); setResult(null); }}>
            <option value="">— Selecione —</option>
            {DISCIPLINAS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          {erro && <div style={{ color: C.red, fontSize: 12, marginBottom: 8 }}>{erro}</div>}
          <button style={{ ...S.btn("primary"), width: "100%" }} onClick={buscar} disabled={loading}>
            {loading ? "Buscando..." : "🔍  Consultar"}
          </button>
        </div>

        {result && (
          <>
            {/* CABEÇALHO */}
            <div style={{ ...S.card, borderTop: `3px solid ${barColor}` }}>
              <div style={{ fontSize: 11, color: C.muted, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>
                PV {result.pvCode} · {result.disciplina}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 16 }}>{result.pvName}</div>

              {/* BARRA DE PROGRESSO */}
              {result.horasVendidas ? (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: C.muted }}>Consumido</span>
                    <span style={{ fontSize: 12, color: C.muted }}>Vendido</span>
                  </div>
                  <div style={{ background: C.border, borderRadius: 6, height: 10, marginBottom: 8, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 6, transition: "width .4s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                    <span style={{ fontWeight: 800, fontSize: 20, color: barColor }}>{result.totalConsumido.toFixed(1)}h</span>
                    <span style={{ fontWeight: 700, fontSize: 16, color: C.muted }}>{result.horasVendidas}h</span>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ flex: 1, background: C.fieldBg, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: 18, color: barColor }}>{pct.toFixed(0)}%</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>CONSUMIDO</div>
                    </div>
                    <div style={{ flex: 1, background: C.fieldBg, borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                      <div style={{ fontWeight: 800, fontSize: 18, color: restante >= 0 ? C.success : C.red }}>
                        {restante >= 0 ? `${restante.toFixed(1)}h` : `-${Math.abs(restante).toFixed(1)}h`}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{restante >= 0 ? "RESTANTE" : "EXCEDIDO"}</div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>
                  ⚠️ Horas vendidas não cadastradas para esta disciplina.
                </div>
              )}
            </div>

            {/* MINHA PARTE */}
            <div style={S.card}>
              <div style={S.h3}>Meu Consumo</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: C.text, fontWeight: 600 }}>{workerName}</span>
                <span style={{ fontWeight: 800, fontSize: 18, color: C.red }}>{myHours.toFixed(1)}h</span>
              </div>
              {result.horasVendidas && (
                <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>
                  {((myHours / result.horasVendidas) * 100).toFixed(0)}% do total vendido
                </div>
              )}
            </div>

            {/* COLABORADORES */}
            {Object.keys(result.byWorker).length > 0 && (
              <div style={S.card}>
                <div style={S.h3}>Todos os Colaboradores</div>
                {Object.entries(result.byWorker)
                  .sort((a, b) => b[1] - a[1])
                  .map(([nome, horas]) => (
                    <div key={nome} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ color: nome === workerName ? C.red : C.text, fontWeight: nome === workerName ? 700 : 400, fontSize: 14 }}>
                        {nome === workerName ? `${nome} (você)` : nome}
                      </span>
                      <span style={{ fontWeight: 700, fontSize: 15, color: C.text }}>{horas.toFixed(1)}h</span>
                    </div>
                  ))}
                <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, marginTop: 4 }}>
                  <span style={{ fontSize: 12, color: C.muted, fontWeight: 700, textTransform: "uppercase" }}>Total geral</span>
                  <span style={{ fontWeight: 800, fontSize: 16, color: C.text }}>{result.totalConsumido.toFixed(1)}h</span>
                </div>
              </div>
            )}

            {Object.keys(result.byWorker).length === 0 && (
              <div style={{ ...S.card, textAlign: "center", color: C.muted, padding: 32 }}>
                Nenhum apontamento encontrado para este projeto e disciplina.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── ENTRY ROW ───────────────────────────────────────────────────────────────
function EntryRow({ entry, onDelete }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: `1px solid ${C.border}` }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14, color: C.text }}>
          PV {entry.pvCode} <span style={{ color: C.muted, fontWeight: 400 }}>·</span> <span style={{ color: C.red, fontWeight: 600 }}>{entry.pvName}</span>
        </div>
        {entry.disciplina && (
          <div style={{ display: "inline-block", background: C.border, color: C.muted, borderRadius: 4, fontSize: 11, fontWeight: 600, padding: "2px 7px", marginTop: 3, textTransform: "uppercase", letterSpacing: "0.4px" }}>
            {entry.disciplina}
          </div>
        )}
        <div style={{ color: C.muted, fontSize: 12, marginTop: 3 }}>
          {fmtDate(entry.date)} · {entry.entrada} – {entry.saida}
        </div>
        {entry.obs && (
          <div style={{ color: C.muted, fontSize: 12, marginTop: 4, fontStyle: "italic" }}>
            💬 "{entry.obs}"
          </div>
        )}
        {entry.semComentario && (
          <div style={{ color: C.faint, fontSize: 11, marginTop: 3 }}>— Sem comentários</div>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: C.success }}>{entry.hoursLabel}</div>
        </div>
        <button onClick={() => onDelete(entry)} style={{
          background: "none", border: `1px solid ${C.border}`, borderRadius: 5,
          color: C.faint, cursor: "pointer", fontSize: 12, padding: "4px 8px",
          transition: "color .15s, border-color .15s",
        }}
          onMouseEnter={e => { e.target.style.color = C.red; e.target.style.borderColor = C.red; }}
          onMouseLeave={e => { e.target.style.color = C.faint; e.target.style.borderColor = C.border; }}
        >✕</button>
      </div>
    </div>
  );
}
