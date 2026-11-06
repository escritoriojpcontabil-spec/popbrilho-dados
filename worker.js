// POP BRILHO · Ponte NFC-e (Cloudflare Worker)
// Recebe as vendas do painel da loja e emite a NFC-e na Focus NFe.
// O token da Focus fica guardado aqui (variável secreta FOCUS_TOKEN), nunca no site.
//
// Variáveis do Worker (Settings → Variables and Secrets):
//   FOCUS_TOKEN   (Secret)  token da empresa no painel da Focus NFe
//   AMBIENTE      (Text)    homologacao  ou  producao
//   CNPJ          (Text)    67905362000100
//   REPO_GESTAO   (Text)    escritoriojpcontabil-spec/popbrilho-gestao
//   ORIGENS       (Text)    https://popbrilhope.com.br,https://www.popbrilhope.com.br
//
// Segurança: só aceita pedidos de quem está logado no painel, ou seja, de quem tem
// uma chave do GitHub com permissão de escrita no repositório privado da loja.

const HOMOLOG_DESC = "NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL";

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ORIGENS || "https://popbrilhope.com.br,https://www.popbrilhope.com.br").split(",").map(s => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
      "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization,Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/") return json({ servico: "Ponte NFC-e POP BRILHO", ok: true });

    // ---- login: a chave do GitHub precisa ter escrita no repositório privado ----
    const gh = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!gh) return json({ erro: "sem_login", mensagem: "Entre no painel da loja para emitir notas." }, 401);
    const repo = env.REPO_GESTAO || "escritoriojpcontabil-spec/popbrilho-gestao";
    const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: { Authorization: "Bearer " + gh, "User-Agent": "popbrilho-nfce", Accept: "application/vnd.github+json" } });
    if (!r.ok) return json({ erro: "login_invalido", mensagem: "Login do painel não reconhecido pela ponte." }, 401);
    const info = await r.json();
    if (!info.permissions || !info.permissions.push) return json({ erro: "sem_permissao", mensagem: "Este login não pode emitir notas." }, 403);

    if (!env.FOCUS_TOKEN) return json({ erro: "sem_token", mensagem: "Falta configurar o FOCUS_TOKEN no Worker." }, 500);
    const prod = String(env.AMBIENTE || "").toLowerCase().startsWith("prod");
    const base = prod ? "https://api.focusnfe.com.br" : "https://homologacao.focusnfe.com.br";
    const auth = "Basic " + btoa(env.FOCUS_TOKEN + ":");
    const focus = (p, opt = {}) => fetch(base + p, { ...opt, headers: { Authorization: auth, "Content-Type": "application/json", ...(opt.headers || {}) } });
    const extras = async (o, comXml) => {
      if (o && o.caminho_danfe) o.danfe_url = base + o.caminho_danfe;
      if (comXml && o && o.status === "autorizado" && o.caminho_xml_nota_fiscal) {
        try { const x = await focus(o.caminho_xml_nota_fiscal); if (x.ok) o.xml = await x.text(); } catch (_) {}
      }
      return o;
    };
    const ler = async res => { const t = await res.text(); try { return JSON.parse(t); } catch (_) { return { erro: "resposta_invalida", mensagem: t.slice(0, 300) }; } };

    // ---- situação da ponte ----
    if (path === "/status" && req.method === "GET") {
      return json({ ok: true, ambiente: prod ? "producao" : "homologacao", cnpj: env.CNPJ || "" });
    }

    const m = path.match(/^\/nfce(?:\/([A-Za-z0-9_-]{1,60}))?$/);
    if (!m) return json({ erro: "rota_invalida" }, 404);
    const ref = m[1] || url.searchParams.get("ref") || "";
    if (!/^[A-Za-z0-9_-]{1,60}$/.test(ref)) return json({ erro: "ref_invalida", mensagem: "Referência da nota inválida." }, 400);

    // ---- emitir ----
    if (req.method === "POST") {
      let nota;
      try { nota = await req.json(); } catch (_) { return json({ erro: "json_invalido" }, 400); }
      if (!nota || !Array.isArray(nota.items) || !nota.items.length) return json({ erro: "sem_itens", mensagem: "A nota não tem itens." }, 400);
      if (env.CNPJ) nota.cnpj_emitente = String(env.CNPJ).replace(/\D/g, "");
      if (!prod) { nota.items[0].descricao = HOMOLOG_DESC; if (nota.nome_destinatario) nota.nome_destinatario = "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL"; }
      const res = await focus(`/v2/nfce?ref=${encodeURIComponent(ref)}`, { method: "POST", body: JSON.stringify(nota) });
      const o = await ler(res);
      o.ambiente = prod ? "producao" : "homologacao";
      return json(await extras(o, true), res.status);
    }
    // ---- consultar ----
    if (req.method === "GET") {
      const res = await focus(`/v2/nfce/${encodeURIComponent(ref)}`);
      const o = await ler(res);
      o.ambiente = prod ? "producao" : "homologacao";
      return json(await extras(o, url.searchParams.get("xml") === "1"), res.status);
    }
    // ---- cancelar ----
    if (req.method === "DELETE") {
      let b = {};
      try { b = await req.json(); } catch (_) {}
      const just = String(b.justificativa || "").trim();
      if (just.length < 15 || just.length > 255) return json({ erro: "justificativa", mensagem: "A justificativa precisa ter de 15 a 255 caracteres." }, 400);
      const res = await focus(`/v2/nfce/${encodeURIComponent(ref)}`, { method: "DELETE", body: JSON.stringify({ justificativa: just }) });
      const o = await ler(res);
      if (o.caminho_xml_cancelamento) { try { const x = await focus(o.caminho_xml_cancelamento); if (x.ok) o.xml_cancelamento = await x.text(); } catch (_) {} }
      return json(o, res.status);
    }
    return json({ erro: "metodo_invalido" }, 405);
  },
};
