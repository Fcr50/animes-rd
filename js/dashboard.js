// js/dashboard.js
import { supabase } from './supabase-client.js';
import { signInWithGoogle, onAuthStateChange, getCurrentUser } from './auth.js';

const dashboardContent = document.getElementById('dashboard-content');
const authCheck = document.getElementById('auth-check');
const groupsList = document.getElementById('groups-list');
const createGroupForm = document.getElementById('create-group-form');
const joinGroupForm = document.getElementById('join-group-form');
const btnLoginDashboard = document.getElementById('btn-login-dashboard');

let currentUser = null;
let currentManagingGroupId = null;

async function init() {
  console.log('Iniciando Dashboard...');

  const user = await getCurrentUser();
  if (user) {
    handleAuthState(user);
  } else {
    authCheck.style.display = 'block';
  }

  onAuthStateChange((event, sessionUser) => {
    handleAuthState(sessionUser);
  });

  if (btnLoginDashboard) btnLoginDashboard.addEventListener('click', signInWithGoogle);

  if (createGroupForm) {
    createGroupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await createGroup(document.getElementById('group-name').value);
    });
  }

  if (joinGroupForm) {
    joinGroupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await joinGroup(document.getElementById('invite-code').value);
    });
  }

  // Eventos do Modal de Gestão
  document.getElementById('edit-group-form')?.addEventListener('submit', handleUpdateGroupName);
  document.getElementById('btn-delete-group')?.addEventListener('click', handleDeleteGroup);
}

function handleAuthState(user) {
  currentUser = user;
  if (user) {
    if (dashboardContent) dashboardContent.style.display = 'block';
    if (authCheck) authCheck.style.display = 'none';
    loadGroups();
  } else {
    if (dashboardContent) dashboardContent.style.display = 'none';
    if (authCheck) authCheck.style.display = 'block';
  }
}

async function loadGroups() {
  if (!groupsList) return;
  groupsList.innerHTML = '<div class="skeleton" style="height: 100px;"></div>';

  const { data, error } = await supabase
    .from('group_members')
    .select('group_id, groups(id, name, creator_id, invite_code)')
    .eq('user_id', currentUser.id);

  if (error) {
    console.error('Supabase error loading groups:', error);
    groupsList.innerHTML = '<p>Erro ao carregar seus grupos.</p>';
    return;
  }

  if (!data || data.length === 0) {
    groupsList.innerHTML = '<p style="color: var(--faint); grid-column: 1/-1; text-align: center; padding: 20px; border: 1px dashed var(--border); border-radius: 8px;">Você ainda não participa de nenhum grupo.</p>';
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
            ${isCreator ? `👑 Criador (Código: <strong style="color: var(--accent)">${inviteCode}</strong>)` : 'Membro'}
          </p>
        </a>
        
        <div style="position: absolute; bottom: 15px; left: 20px; right: 15px; display: flex; justify-content: space-between; align-items: center;">
           <a href="${url}" style="font-size: 11px; color: var(--accent); text-decoration: none;">Abrir acervo →</a>
           ${isCreator ? `<button class="btn-manage-trigger" onclick="window.openManageModal('${groupId}', '${groupName}')" title="Gerenciar Grupo">⚙️</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// Funções Globais para o Modal
window.openManageModal = async function(groupId, name) {
  currentManagingGroupId = groupId;
  document.getElementById('edit-group-name').value = name;
  document.getElementById('modal-manage-group').classList.add('open');
  loadManageMembers(groupId);
};

window.closeManageModal = function() {
  document.getElementById('modal-manage-group').classList.remove('open');
};

async function loadManageMembers(groupId) {
  const container = document.getElementById('manage-members-list');
  container.innerHTML = '<div class="skeleton" style="height: 30px;"></div>';

  const { data, error } = await supabase
    .from('group_members')
    .select('user_id, nickname, role')
    .eq('group_id', groupId);

  if (error) return;

  container.innerHTML = data.map(m => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--border);">
      <span>${m.nickname} ${m.user_id === currentUser.id ? '(Você)' : ''}</span>
      ${m.role !== 'admin' ? `<button onclick="removeMember('${m.user_id}')" style="color: var(--danger); background: none; border: none; cursor: pointer; font-size: 11px;">Remover</button>` : '<span style="font-size: 11px; color: var(--faint);">Admin</span>'}
    </div>
  `).join('');
}

window.removeMember = async function(userId) {
  if (!confirm('Tem certeza que deseja remover este membro?')) return;
  
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', currentManagingGroupId)
    .eq('user_id', userId);

  if (error) alert('Erro ao remover: ' + error.message);
  else loadManageMembers(currentManagingGroupId);
};

async function handleUpdateGroupName(e) {
  e.preventDefault();
  const newName = document.getElementById('edit-group-name').value;
  
  const { error } = await supabase
    .from('groups')
    .update({ name: newName })
    .eq('id', currentManagingGroupId);

  if (error) alert('Erro ao atualizar: ' + error.message);
  else {
    alert('Nome atualizado!');
    loadGroups();
    closeManageModal();
  }
}

async function handleDeleteGroup() {
  if (!confirm('PERIGO: Tem certeza que deseja excluir o grupo? Esta ação não pode ser desfeita!')) return;
  const pass = prompt('Digite o nome do grupo para confirmar a exclusão:');
  
  const { data: group } = await supabase.from('groups').select('name').eq('id', currentManagingGroupId).single();
  
  if (pass !== group.name) {
    alert('Nome incorreto. Exclusão cancelada.');
    return;
  }

  const { error } = await supabase
    .from('groups')
    .delete()
    .eq('id', currentManagingGroupId);

  if (error) alert('Erro ao excluir: ' + error.message);
  else {
    alert('Grupo excluído com sucesso.');
    loadGroups();
    closeManageModal();
  }
}

async function createGroup(name) {
  try {
    const inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert([{ name, invite_code: inviteCode, creator_id: currentUser.id }])
      .select().single();

    if (groupError) throw groupError;
    alert(`Grupo "${name}" criado!`);
    window.location.href = `./join.html#code=${inviteCode}`;
  } catch (err) { alert(err.message); }
}

async function joinGroup(inviteCode) {
  const code = inviteCode.trim().toUpperCase();
  const { data: group, error } = await supabase.from('groups').select('id').eq('invite_code', code).single();
  if (error || !group) alert('Código inválido');
  else window.location.href = `./join.html#code=${code}`;
}

init();
