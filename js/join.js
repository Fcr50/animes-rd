// js/join.js
import { supabase } from './supabase-client.js';
import { signInWithGoogle, onAuthStateChange } from './auth.js';

const loadingGroup = document.getElementById('loading-group');
const authRequired = document.getElementById('auth-required');
const identityForm = document.getElementById('identity-form');
const groupInviteText = document.getElementById('group-invite-text');
const setupIdentityForm = document.getElementById('setup-identity-form');
const btnLoginJoin = document.getElementById('btn-login-join');

let currentUser = null;
let currentGroup = null;

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.substring(1));
  const inviteCode = urlParams.get('code') || hashParams.get('code');

  if (!inviteCode) {
    console.error('Invite code missing in URL/Hash');
    alert('Nenhum código de convite fornecido.');
    window.location.href = 'index.html';
    return;
  }

  // Load group info
  const { data: group, error: groupError } = await supabase
    .from('groups')
    .select('id, name, creator_id')
    .ilike('invite_code', inviteCode.trim())
    .single();

  if (groupError || !group) {
    console.error('Erro ao carregar grupo pelo convite:', groupError);
    alert('Convite inválido ou expirado.');
    window.location.href = 'index.html';
    return;
  }

  currentGroup = group;
  groupInviteText.textContent = `Você está entrando no grupo "${group.name}".`;

  onAuthStateChange(async (event, user) => {
    currentUser = user;
    loadingGroup.style.display = 'none';

    if (user) {
      // Check if already a member
      const { data: member } = await supabase
        .from('group_members')
        .select('group_id')
        .eq('group_id', group.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (member) {
        window.location.href = `acervo.html#g=${group.id}`;
        return;
      }

      identityForm.style.display = 'block';
      authRequired.style.display = 'none';
      
      // Pre-fill nickname
      document.getElementById('member-nickname').value = user.user_metadata.full_name || '';
    } else {
      identityForm.style.display = 'none';
      authRequired.style.display = 'block';
    }
  });

  btnLoginJoin.addEventListener('click', signInWithGoogle);

  setupIdentityForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = document.getElementById('member-nickname').value;
    const color = document.getElementById('member-color').value;
    
    // O cargo é 'admin' se for o criador do grupo, senão 'member'
    const role = (currentUser.id === currentGroup.creator_id) ? 'admin' : 'member';
    
    await joinGroup(nickname, color, role);
  });
}

async function joinGroup(nickname, color, role) {
  const { error } = await supabase
    .from('group_members')
    .insert([{ 
      group_id: currentGroup.id, 
      user_id: currentUser.id, 
      nickname: nickname,
      color: color,
      role: role 
    }]);

  if (error) {
    alert('Erro ao entrar no grupo: ' + error.message);
    return;
  }

  window.location.href = `acervo.html#g=${currentGroup.id}`;
}

init();
