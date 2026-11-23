// Edge Function: admin-criar-usuario (Deno) — Etiquetas Macaw
// Cria (com senha inicial) ou convida (sem senha) um usuário e define o perfil.
// Somente administradores ativos podem chamar. A service role fica apenas no
// servidor; o navegador nunca usa signUp com a chave anon para criar contas.
//
// Publicar:  supabase functions deploy admin-criar-usuario
// Variáveis (já presentes no runtime do Supabase): SUPABASE_URL,
//   SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.
// Opcional: ALLOWED_ORIGIN (ex.: https://etiquetas.macaw.com.br) para CORS.
import { createClient } from 'npm:@supabase/supabase-js@2';

const PAPEIS = ['admin', 'gerente', 'cozinheiro'];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta(405, { error: 'Método não permitido.' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const authHeader = req.headers.get('Authorization') ?? '';

  // 1) Quem chama precisa ser admin ativo (checado com o JWT do próprio usuário)
  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const { data: u } = await comoUsuario.auth.getUser();
  if (!u?.user) return resposta(401, { error: 'Sessão expirada. Entre novamente.' });
  const { data: ehAdmin, error: errAdmin } = await comoUsuario.rpc('is_admin');
  if (errAdmin || ehAdmin !== true) return resposta(403, { error: 'Somente administradores podem cadastrar usuários.' });

  // 2) Validação da entrada
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return resposta(400, { error: 'Corpo inválido.' });
  }
  const email = String(body.email ?? '').trim().toLowerCase();
  const nome = String(body.nome ?? '').trim().slice(0, 120);
  const senha = body.senha ? String(body.senha) : '';
  const papel = String(body.papel ?? 'cozinheiro');
  const unidade = body.unidade_id ? String(body.unidade_id) : null;
  const redirectTo = body.redirect_to ? String(body.redirect_to) : undefined;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return resposta(400, { error: 'E-mail inválido.' });
  if (!nome) return resposta(400, { error: 'Informe o nome.' });
  if (!PAPEIS.includes(papel)) return resposta(400, { error: 'Papel inválido.' });
  if (papel !== 'admin' && !unidade) return resposta(400, { error: 'Gerentes e cozinheiros precisam de uma unidade.' });
  if (unidade && !UUID_RE.test(unidade)) return resposta(400, { error: 'Unidade inválida.' });
  if (senha && senha.length < 8) return resposta(400, { error: 'A senha inicial deve ter ao menos 8 caracteres.' });

  // 3) Cria/convida com a service role (o trigger cria o perfil inativo)
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const criado = senha
    ? await admin.auth.admin.createUser({ email, password: senha, email_confirm: true, user_metadata: { nome } })
    : await admin.auth.admin.inviteUserByEmail(email, { data: { nome }, redirectTo });
  if (criado.error || !criado.data?.user) {
    const msg = criado.error?.message ?? '';
    if (/already (been )?registered|exists/i.test(msg)) return resposta(409, { error: 'Já existe um usuário com este e-mail.' });
    return resposta(400, { error: msg || 'Não foi possível criar o usuário.' });
  }

  // 4) Define o perfil (service role: sem auth.uid(), o trigger de proteção permite)
  const { data: perfil, error: errPerfil } = await admin
    .from('perfis')
    .update({ nome, papel, unidade_id: unidade, ativo: true })
    .eq('id', criado.data.user.id)
    .select('*')
    .single();
  if (errPerfil) return resposta(500, { error: `Usuário criado, mas o perfil não foi definido: ${errPerfil.message}` });

  return resposta(200, { perfil });
});
