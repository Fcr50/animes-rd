// js/dashboard.js
import { supabase } from './supabase-client.js';
import { signInWithGoogle, onAuthStateChange, getCurrentUser } from './auth.js';

let currentUser = null;
let currentManagingGroupId = null;

async function init() {
  console.log('Dashboard: Iniciando inicialização...');
  
  // Seleção de elementos dentro do init para garantir que existam
  const dashboardContent = document.getElementById('dashboard-content');
  const authCheck = document.getElementById('auth-check');
  const groupsList = document.getElementById('groups-list');
  const createGroupForm = document.getElementById('create-group-form');
  const joinGroupForm = document.getElementById('join-group-form');
  const btnLoginDashboard = document.getElementById('btn-login-dashboard');

  if (!dashboardContent || !authCheck) {
    console.error('Erro: Elementos base do Dashboard não encontrados no HTML.');
    return;
  }

  // Função interna para gerenciar o estado visual
  const handleAuthState = async (user) => {
    currentUser = user;
    if (user) {
      console.log('Usuário detectado:', user.email);
      dashboardContent.style.setProperty('display', 'block', 'important');
      authCheck.style.setProperty('display', 'none', 'important');
      await loadGroups();
    } else {
      console.log('Nenhum usuário logado.');
      dashboardContent.style.setProperty('display', 'none', 'important');
      authCheck.style.setProperty('display', 'block', 'important');
    }
  };

  // 1. Verifica sessão inicial
  try {
    const user = await getCurrentUser();
    await handleAuthState(user);
  } catch (err) {
    console.error('Erro ao verificar usuário inicial:', err);
  }

  // 2. Escuta mudanças de auth
  onAuthStateChange((event, sessionUser) => {
    console.log('Evento de Auth:', event);
    handleAuthState(sessionUser);
  });

  // 3. Atribui eventos
  if (btnLoginDashboard) btnLoginDashboard.onclick = signInWithGoogle;

  if (createGroupForm) {
    createGroupForm.onsubmit = async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById('group-name');
      if (nameInput) await createGroup(nameInput.value);
    };
  }

  if (joinGroupForm) {
    joinGroupForm.onsubmit = async (e) => {
      e.preventDefault();
      const codeInput = document.getElementById('invite-code');
      if (codeInput) await joinGroup(codeInput.value);
    };
  }

  // Eventos do Modal
  document.getElementById('edit-group-form')?.addEventListener('submit', handleUpdateGroupName);
  document.getElementById('btn-delete-group')?.addEventListener('click', handleDeleteGroup);
}

async function loadGroups() {
  const groupsList = document.getElementById('groups-list');
  if (!groupsList || !currentUser) return;

  groupsList.innerHTML = '<div class="skeleton" style="height: 100px;"></div>';

  try {
    const { data, error } = await supabase
      .from('group_members')
      .select('group_id, groups(id, name, creator_id, invite_code)')
      .eq('user_id', currentUser.id);

    if (error) throw error;

    if (!data || data.length === 0) {
      groupsList.innerHTML = `
        <div style="color: var(--faint); grid-column: 1/-1; text-align: center; padding: 20px; border: 1px dashed var(--border); border-radius: 8px;">
          <p>Você ainda não participa de nenhum grupo.</p>
          <p style="font-size: 10px; margin-top: 10px; opacity: 0.5;">ID: ${currentUser.id}</p>
        </div>`;
      return;
    }

    groupsList.innerHTML = data.map(item => {
      const groupId = item.group_id;
      const groupName = item.groups?.name || 'Sem Nome';
      const isCreator = item.groups?.creator_id === currentUser.id;
      const inviteCode = item.groups?.invite_code || '---';
      const url = `acervo.html#g=${groupId}`;

      return `
        <div class="card group-card" style="position: relative; padding-bottom: 50px;">
          <a href="${url}" style="text-decoration: none; color: inherit; display: block;">
            <div class="card-title">${groupName}</div>
            <p style="font-size: 12px; color: var(--faint); margin-top: 8px;">
              ${isCreator ? `👑 Criador (Cód: <strong style="color: var(--accent)">${inviteCode}</strong>)` : 'Membro'}
            </p>
          </a>
          <div style="position: absolute; bottom: 15px; left: 20px; right: 15px; display: flex; justify-content: space-between; align-items: center;">
             <a href="${url}" style="font-size: 11px; color: var(--accent); text-decoration: none;">Abrir acervo →</a>
             ${isCreator ? `<button class="btn-manage-trigger" onclick="window.openManageModal('${groupId}', '${groupName}')" title="Gerenciar">⚙️</button>` : ''}
          </div>
        </div>`;
    }).join('');
  } catch (err) {
    groupsList.innerHTML = `<p style="color:red">Erro ao carregar dados: ${err.message}</p>`;
  }
}

// Funções Globais (Modal)
window.openManageModal = async function(groupId, name) {
  currentManagingGroupId = groupId;
  const input = document.getElementById('edit-group-name');
  if (input) input.value = name;
  document.getElementById('modal-manage-group')?.classList.add('open');
  loadManageMembers(groupId);
};

window.closeManageModal = () => document.getElementById('modal-manage-group')?.classList.remove('open');

async function loadManageMembers(groupId) {
  const container = document.getElementById('manage-members-list');
  if (!container) return;
  const { data } = await supabase.from('group_members').select('user_id, nickname, role').eq('group_id', groupId);
  if (data) {
    container.innerHTML = data.map(m => `
      <div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid var(--border);">
        <span>${m.nickname}</span>
        ${m.role !== 'admin' ? `<button onclick="removeMember('${m.user_id}')" style="color:var(--danger); background:none; border:none; cursor:pointer;">Remover</button>` : '<span style="font-size:11px">Admin</span>'}
      </div>`).join('');
  }
}

window.removeMember = async (uid) => {
  if (confirm('Remover membro?')) {
    await supabase.from('group_members').delete().eq('group_id', currentManagingGroupId).eq('user_id', uid);
    loadManageMembers(currentManagingGroupId);
  }
};

async function handleUpdateGroupName(e) {
  e.preventDefault();
  const name = document.getElementById('edit-group-name').value;
  const { error } = await supabase.from('groups').update({ name }).eq('id', currentManagingGroupId);
  if (!error) { alert('Sucesso!'); loadGroups(); closeManageModal(); }
}

async function handleDeleteGroup() {
  if (confirm('Excluir permanentemente?')) {
    const { error } = await supabase.from('groups').delete().eq('id', currentManagingGroupId);
    if (!error) { loadGroups(); closeManageModal(); }
  }
}

async function createGroup(name) {
  const { data, error } = await supabase.from('groups').insert([{ name, invite_code: Math.random().toString(36).substring(2,8).toUpperCase(), creator_id: currentUser.id }]).select().single();
  if (!error) window.location.href = `./join.html#code=${data.invite_code}`;
  else alert(error.message);
}

async function joinGroup(code) {
  const { data, error } = await supabase.from('groups').select('id').eq('invite_code', code.toUpperCase()).single();
  if (!error) window.location.href = `./join.html#code=${code.toUpperCase()}`;
  else alert('Código inválido');
}

// Inicia quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
