// js/auth.js
import { supabase } from './supabase-client.js';

/**
 * Faz login com o provedor Google.
 */
export async function signInWithGoogle() {
  // Pega o caminho da pasta (ex: /animes-rd/)
  let path = window.location.pathname;
  if (!path.endsWith('/')) {
    // Se estiver em um arquivo .html, pega a pasta pai
    if (path.includes('.html')) {
      path = path.substring(0, path.lastIndexOf('/') + 1);
    } else {
      path += '/';
    }
  }
  
  // Forçamos o retorno para a index.html da pasta atual
  const targetRedirect = window.location.origin + path + 'index.html';
  console.log('Solicitando login Google. Redirect planejado:', targetRedirect);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: targetRedirect
    }
  });

  if (error) {
    console.error('Erro ao fazer login:', error.message);
    throw error;
  }
  return data;
}

/**
 * Faz logout do usuário.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('Erro ao fazer logout:', error.message);
    throw error;
  }
  
  // Detecta o caminho da pasta para o logout
  let path = window.location.pathname;
  if (path.includes('.html')) {
    path = path.substring(0, path.lastIndexOf('/') + 1);
  }
  if (!path.endsWith('/')) path += '/';

  // Força o retorno para a raiz do projeto (/animes-rd/)
  window.location.href = window.location.origin + path + 'index.html';
}

/**
 * Obtém o usuário atual.
 */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Escuta mudanças no estado de autenticação.
 */
export function onAuthStateChange(callback) {
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session?.user || null);
  });
}
