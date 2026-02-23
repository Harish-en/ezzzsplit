// ============================================
// STATE MANAGEMENT
// ============================================

const appState = {
    members: ['Lạc', 'Minh', 'Duy', 'Hào', 'Quý', 'Kiệt', 'Hoàng'],
    expenses: []
};

// Biến cờ để theo dõi xem người dùng đang "Thêm mới" hay "Sửa" khoản chi
let editingExpenseId = null;

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatCurrency(value) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
}

function roundAmount(amount) {
    return Math.round(amount);
}

function getInitials(name) {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
}

// Hàm chống XSS: Escaping các ký tự đặc biệt trước khi render ra HTML
function escapeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag] || tag));
}

// ============================================
// DATA OPERATIONS
// ============================================

function addMember(name) {
    if (!name || name.trim() === '') {
        alert('Vui lòng nhập tên thành viên');
        return false;
    }
    const cleanName = name.trim();
    if (appState.members.some(m => m.toLowerCase() === cleanName.toLowerCase())) {
        alert('Thành viên này đã tồn tại');
        return false;
    }
    appState.members.push(cleanName);
    saveState();
    return true;
}

function removeMember(name) {
    appState.members = appState.members.filter(m => m !== name);
    appState.expenses = appState.expenses.map(e => ({
        ...e,
        participants: e.participants.filter(p => p.name !== name),
        paidBy: e.paidBy.filter(p => p !== name)
    }));
    saveState();
}

// Hàm xử lý dữ liệu thuần, không còn gọi DOM
function addExpense(name, amount, paidBy, participants, isEqualSplit, paidBySplitMode, paidByAmounts) {
    const expense = {
        id: Date.now(),
        name,
        amount: roundAmount(amount),
        paidBy, 
        paidBySplitMode, 
        paidByAmounts, 
        participants,
        isEqualSplit,
        date: new Date().toLocaleDateString('vi-VN')
    };
    appState.expenses.push(expense);
    saveState();
    return expense;
}

function updateExpense(id, name, amount, paidBy, participants, isEqualSplit, paidBySplitMode, paidByAmounts) {
    const expense = appState.expenses.find(e => e.id === id);
    if (expense) {
        expense.name = name;
        expense.amount = roundAmount(amount);
        expense.paidBy = paidBy;
        expense.participants = participants;
        expense.isEqualSplit = isEqualSplit;
        expense.paidBySplitMode = paidBySplitMode;
        expense.paidByAmounts = paidByAmounts;
        saveState();
    }
}

function deleteExpense(id) {
    appState.expenses = appState.expenses.filter(e => e.id !== id);
    saveState();
}

function saveState() {
    localStorage.setItem('ezzz-split-state', JSON.stringify(appState));
}

function loadState() {
    const saved = localStorage.getItem('ezzz-split-state');
    if (saved) {
        const parsed = JSON.parse(saved);
        appState.members = parsed.members || appState.members;
        appState.expenses = parsed.expenses || [];
    }
}

// ============================================
// CALCULATION ENGINE
// ============================================

function calculateExpenses() {
    const personSummary = {};
    
    appState.members.forEach(member => {
        personSummary[member] = {
            name: member,
            totalPaid: 0,
            totalShare: 0,
            balance: 0
        };
    });
    
    appState.expenses.forEach(expense => {
        const amount = expense.amount;
        const numPaidBy = expense.paidBy.length;
        
        let paidAmounts = {};
        if (numPaidBy > 1 && expense.paidBySplitMode === 'custom' && expense.paidByAmounts) {
            paidAmounts = expense.paidByAmounts;
        } else {
            const amountPerPayer = amount / numPaidBy; // Bỏ làm tròn sớm để tránh sai số thập phân
            expense.paidBy.forEach(payer => {
                paidAmounts[payer] = amountPerPayer;
            });
        }
        
        expense.paidBy.forEach(payer => {
            if (personSummary[payer]) {
                personSummary[payer].totalPaid += paidAmounts[payer] || 0;
            }
        });
        
        if (expense.isEqualSplit) {
            const sharePerPerson = amount / expense.participants.length;
            expense.participants.forEach(p => {
                if (personSummary[p.name]) {
                    personSummary[p.name].totalShare += sharePerPerson;
                }
            });
        } else {
            expense.participants.forEach(p => {
                if (personSummary[p.name]) {
                    personSummary[p.name].totalShare += p.share;
                }
            });
        }
    });
    
    Object.values(personSummary).forEach(person => {
        // Làm tròn balance cuối cùng để tránh lỗi số học dấu phẩy động (vd: 0.000000001)
        person.balance = roundAmount(person.totalPaid - person.totalShare);
        person.totalPaid = roundAmount(person.totalPaid);
        person.totalShare = roundAmount(person.totalShare);
    });
    
    return personSummary;
}

function simplifyTransactions(personSummary) {
    const transactions = [];
    const balances = {};
    
    Object.values(personSummary).forEach(person => {
        if (Math.abs(person.balance) >= 1) { // Bỏ qua các khoản lệch quá nhỏ (dưới 1 VNĐ)
            balances[person.name] = person.balance;
        }
    });
    
    while (Object.keys(balances).length > 0) {
        const debtor = Object.entries(balances).find(([_, b]) => b < 0);
        const creditor = Object.entries(balances).find(([_, b]) => b > 0);
        
        if (!debtor || !creditor) break;
        
        const [debtorName, debtAmount] = debtor;
        const [creditorName, creditAmount] = creditor;
        
        const amount = Math.min(Math.abs(debtAmount), creditAmount);
        
        transactions.push({
            from: debtorName,
            to: creditorName,
            amount: roundAmount(amount)
        });
        
        balances[debtorName] += amount;
        balances[creditorName] -= amount;
        
        if (Math.abs(balances[debtorName]) < 1) delete balances[debtorName];
        if (Math.abs(balances[creditorName]) < 1) delete balances[creditorName];
    }
    
    return transactions;
}

// ============================================
// VALIDATION
// ============================================

function validateExpenseForm(name, amount, paidBy, participants, isEqualSplit, paidBySplitMode, paidByAmounts) {
    const errors = [];
    
    if (!name || name.trim() === '') errors.push('Vui lòng nhập tên chi tiêu');
    if (!amount || amount <= 0) errors.push('Vui lòng nhập số tiền hợp lệ lớn hơn 0');
    if (!paidBy || paidBy.length === 0) errors.push('Vui lòng chọn người trả tiền');
    if (!participants || participants.length === 0) errors.push('Vui lòng chọn người tham gia');
    
    // Validate người thanh toán tùy chỉnh
    if (paidBy.length > 1 && paidBySplitMode === 'custom') {
        const totalPaidBy = Object.values(paidByAmounts).reduce((sum, val) => sum + val, 0);
        if (roundAmount(totalPaidBy) !== roundAmount(amount)) {
            errors.push(`Tổng tiền người trả tùy chỉnh (${formatCurrency(totalPaidBy)}) phải khớp với tổng hóa đơn (${formatCurrency(amount)}).`);
        }
    }

    // Validate người tham gia tùy chỉnh
    if (!isEqualSplit) {
        const total = participants.reduce((sum, p) => sum + (p.share || 0), 0);
        if (roundAmount(total) !== roundAmount(amount)) {
            errors.push(`Tổng tiền chia tùy chỉnh (${formatCurrency(total)}) phải khớp với tổng hóa đơn (${formatCurrency(amount)}).`);
        }
    }
    
    return errors;
}

// ============================================
// UI RENDERING
// ============================================

function renderMembers() {
    const membersList = document.getElementById('membersList');
    const paidByList = document.getElementById('paidByList');
    const participantsList = document.getElementById('participantsList');
    
    const currentPaidBy = new Set();
    document.querySelectorAll('.paidBy-checkbox:checked').forEach(checkbox => {
        currentPaidBy.add(checkbox.value);
    });
    
    membersList.innerHTML = '';
    paidByList.innerHTML = '';
    participantsList.innerHTML = '';
    
    appState.members.forEach(member => {
        const safeMember = escapeHTML(member);
        
        const memberChip = document.createElement('div');
        memberChip.className = 'member-chip';
        memberChip.innerHTML = `
            <div class="member-avatar">${getInitials(safeMember)}</div>
            <span>${safeMember}</span>
            <button class="ml-2 hover:opacity-80 transition" onclick="handleRemoveMember('${safeMember}')" title="Xóa">
                <i class="fas fa-times text-sm"></i>
            </button>
        `;
        membersList.appendChild(memberChip);
        
        const isChecked = currentPaidBy.has(member) ? 'checked' : '';
        const paidByItem = document.createElement('label');
        paidByItem.className = 'flex items-center cursor-pointer p-2 hover:bg-gray-100 rounded transition';
        paidByItem.innerHTML = `
            <input type="checkbox" class="paidBy-checkbox mr-3" value="${safeMember}" ${isChecked}>
            <span class="text-sm font-medium text-gray-700">${safeMember}</span>
        `;
        paidByList.appendChild(paidByItem);
        
        const participantItem = document.createElement('label');
        participantItem.className = 'flex items-center cursor-pointer p-2 hover:bg-gray-100 rounded transition';
        participantItem.innerHTML = `
            <input type="checkbox" class="participant-checkbox mr-3" value="${safeMember}" checked>
            <span class="text-sm font-medium text-gray-700 flex-1">${safeMember}</span>
            <input type="number" id="share_${safeMember}" class="share-input hidden w-20 px-2 py-1 border border-gray-300 rounded text-right" placeholder="0" min="0" step="1000">
        `;
        participantsList.appendChild(participantItem);
    });
    
    updateSplitMode();
}

function renderExpenses() {
    const expensesList = document.getElementById('expensesList');
    expensesList.innerHTML = '';
    
    if (appState.expenses.length === 0) {
        expensesList.innerHTML = '<div class="empty-state text-center py-6"><i class="fas fa-inbox text-4xl text-slate-300 mb-2 block"></i><p class="text-gray-500 text-sm">Chưa có chi tiêu nào</p></div>';
        return;
    }
    
    // Đảo ngược danh sách để bill mới nhất lên đầu
    [...appState.expenses].reverse().forEach(expense => {
        const expenseCard = document.createElement('div');
        expenseCard.className = 'card bg-white p-4 mb-3 hover:shadow-md transition';
        
        const safeName = escapeHTML(expense.name);
        const paidByText = escapeHTML(expense.paidBy.join(', '));
        const participantsText = escapeHTML(expense.participants.map(p => p.name).join(', '));
        
        expenseCard.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h3 class="font-semibold text-gray-800">${safeName}</h3>
                    <p class="text-sm text-gray-600 mt-1"><i class="fas fa-user-check mr-1 text-teal-500"></i>Người trả: ${paidByText}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-lg text-teal-600">${formatCurrency(expense.amount)}</p>
                    <p class="text-xs text-gray-400">${expense.date}</p>
                </div>
            </div>
            <p class="text-sm text-gray-600 mb-4"><i class="fas fa-users mr-1 text-slate-400"></i>Tham gia: <span class="text-slate-500">${participantsText}</span></p>
            <div class="flex gap-2">
                <button type="button" class="btn-secondary text-sm flex-1 py-1.5" onclick="handleEditExpense(${expense.id})">
                    <i class="fas fa-edit mr-1"></i>Sửa
                </button>
                <button type="button" class="btn-secondary text-sm flex-1 py-1.5 text-red-500 hover:bg-red-50 hover:border-red-200" onclick="handleDeleteExpense(${expense.id})">
                    <i class="fas fa-trash mr-1"></i>Xóa
                </button>
            </div>
        `;
        
        expensesList.appendChild(expenseCard);
    });
}

function renderSettlement() {
    const settlementTab = document.getElementById('settlementTab');
    const summaryPaidList = document.getElementById('summaryPaidList');
    const summaryOwingList = document.getElementById('summaryOwingList');
    const transactionsList = document.getElementById('transactionsList');
    
    const personSummary = calculateExpenses();
    const transactions = simplifyTransactions(personSummary);
    
    const paidList = [];
    const owingList = [];
    
    Object.values(personSummary).forEach(person => {
        if (person.balance > 0) paidList.push(person);
        else if (person.balance < 0) owingList.push(person);
    });
    
    paidList.sort((a, b) => b.balance - a.balance);
    owingList.sort((a, b) => a.balance - b.balance);
    
    // Render Cần thu về (Người được trả lại)
    summaryPaidList.innerHTML = paidList.length > 0 ? paidList.map(person => `
        <div class="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
            <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-xs">
                    ${getInitials(escapeHTML(person.name))}
                </div>
                <span class="font-medium text-sm text-slate-700">${escapeHTML(person.name)}</span>
            </div>
            <span class="font-bold text-teal-600">${formatCurrency(person.balance)}</span>
        </div>
    `).join('') : '<p class="text-center text-slate-400 text-sm py-2">Không có ai cần thu về</p>';

    // Render Cần chi ra (Người phải trả)
    summaryOwingList.innerHTML = owingList.length > 0 ? owingList.map(person => `
        <div class="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
            <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center font-bold text-xs">
                    ${getInitials(escapeHTML(person.name))}
                </div>
                <span class="font-medium text-sm text-slate-700">${escapeHTML(person.name)}</span>
            </div>
            <span class="font-bold text-red-500">${formatCurrency(Math.abs(person.balance))}</span>
        </div>
    `).join('') : '<p class="text-center text-slate-400 text-sm py-2">Không có ai nợ</p>';

    // Render Cách chuyển tiền tối ưu
    if (transactions.length === 0) {
        transactionsList.innerHTML = '<div class="text-center py-4"><i class="fas fa-glass-cheers text-2xl text-teal-400 mb-2 block"></i><p class="text-slate-300 text-sm">Tuyệt vời! Mọi người đã hòa tiền.</p></div>';
    } else {
        transactionsList.innerHTML = transactions.map(tx => `
            <div class="flex items-center justify-between p-3 bg-slate-700 rounded-lg border border-slate-600">
                <div class="flex items-center gap-2 flex-1">
                    <span class="font-medium text-sm text-slate-200">${escapeHTML(tx.from)}</span>
                    <i class="fas fa-long-arrow-alt-right text-slate-400"></i>
                    <span class="font-medium text-sm text-slate-200">${escapeHTML(tx.to)}</span>
                </div>
                <span class="font-bold text-teal-300">${formatCurrency(tx.amount)}</span>
            </div>
        `).join('');
    }
}

function updateDisplay() {
    renderMembers();
    renderExpenses();
    renderSettlement();
}

// ============================================
// SPLIT MODE HANDLING
// ============================================

function updatePaidByAmountsDisplay() {
    const isCustom = document.getElementById("paidBySplitCustom").checked;
    const container = document.getElementById("paidByAmountsContainer");
    const inputsDiv = document.getElementById("paidByAmountsInputs");
    
    if (isCustom) {
        container.classList.remove("hidden");
        const paidByCheckboxes = document.querySelectorAll(".paidBy-checkbox:checked");
        const payers = Array.from(paidByCheckboxes).map(cb => cb.value);
        
        inputsDiv.innerHTML = "";
        payers.forEach(payer => {
            const safePayer = escapeHTML(payer);
            const div = document.createElement("div");
            div.className = "flex items-center gap-2";
            div.innerHTML = `
                <label class="w-20 text-sm font-medium text-slate-700 truncate" title="${safePayer}">${safePayer}:</label>
                <input type="number" class="paidByAmount-input flex-1 input-field py-1" data-payer="${safePayer}" placeholder="0" min="0" step="1000">
                <span class="text-sm font-bold text-slate-400">₫</span>
            `;
            inputsDiv.appendChild(div);
            div.querySelector(".paidByAmount-input").addEventListener("input", updatePaidByAmountsTotal);
        });
        updatePaidByAmountsTotal();
    } else {
        container.classList.add("hidden");
    }
}

function updatePaidByAmountsTotal() {
    const inputs = document.querySelectorAll(".paidByAmount-input");
    let total = 0;
    inputs.forEach(input => {
        total += parseFloat(input.value) || 0;
    });
    const totalEl = document.getElementById("paidByAmountsTotal");
    totalEl.textContent = formatCurrency(total);
    
    const targetAmount = parseFloat(document.getElementById('expenseAmount').value) || 0;
    if (total !== targetAmount && targetAmount > 0) {
        totalEl.classList.remove('text-teal-600');
        totalEl.classList.add('text-red-500');
    } else {
        totalEl.classList.remove('text-red-500');
        totalEl.classList.add('text-teal-600');
    }
}

function updatePaidBySplitModeVisibility() {
    const paidByCount = document.querySelectorAll('.paidBy-checkbox:checked').length;
    const section = document.getElementById('paidBySplitModeSection');
    
    if (paidByCount > 1) {
        section.classList.remove('hidden');
    } else {
        section.classList.add('hidden');
        document.getElementById("paidBySplitEqual").checked = true; // Reset lại split mode
    }
    updatePaidByAmountsDisplay();
}

function updateSplitMode() {
    const isEqualSplit = document.getElementById('splitEqual').checked;
    const labels = document.querySelectorAll('#participantsList label');
    
    labels.forEach(label => {
        const checkbox = label.querySelector('.participant-checkbox');
        const shareInput = label.querySelector('.share-input');
        
        if (shareInput) {
            if (isEqualSplit || !checkbox.checked) {
                shareInput.classList.add('hidden');
            } else {
                shareInput.classList.remove('hidden');
            }
        }
    });
    updatePaidBySplitModeVisibility();
}

// ============================================
// EVENT HANDLERS
// ============================================

function handleAddMember() {
    const input = document.getElementById('newMemberName');
    const name = input.value;
    if (addMember(name)) {
        input.value = '';
        updateDisplay();
    }
}

function handleRemoveMember(name) {
    if (confirm(`Bạn chắc chắn muốn xóa thành viên ${name}?\nMọi khoản chi tiêu liên quan sẽ được tự động cập nhật.`)) {
        removeMember(name);
        updateDisplay();
    }
}

// Gom DOM Operations vào đây
function handleAddExpense(event) {
    event.preventDefault();
    
    const name = document.getElementById('expenseName').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const paidBy = Array.from(document.querySelectorAll('.paidBy-checkbox:checked')).map(cb => cb.value);
    const isEqualSplit = document.getElementById('splitEqual').checked;
    
    const paidBySplitMode = document.getElementById('paidBySplitEqual').checked ? 'equal' : 'custom';
    let paidByAmounts = {};
    
    if (paidBySplitMode === 'custom') {
        document.querySelectorAll('.paidByAmount-input').forEach(input => {
            const payer = input.getAttribute('data-payer');
            paidByAmounts[payer] = roundAmount(parseFloat(input.value) || 0);
        });
    }
    
    const participants = [];
    document.querySelectorAll('.participant-checkbox:checked').forEach(checkbox => {
        const share = isEqualSplit ? 0 : roundAmount(parseFloat(document.getElementById(`share_${checkbox.value}`).value) || 0);
        participants.push({ name: checkbox.value, share: share });
    });
    
    const errors = validateExpenseForm(name, amount, paidBy, participants, isEqualSplit, paidBySplitMode, paidByAmounts);
    
    if (errors.length > 0) {
        alert('Vui lòng kiểm tra lại:\n\n- ' + errors.join('\n- '));
        return;
    }
    
    if (editingExpenseId) {
        updateExpense(editingExpenseId, name, amount, paidBy, participants, isEqualSplit, paidBySplitMode, paidByAmounts);
        editingExpenseId = null;
        document.querySelector('button[type="submit"]').innerHTML = '<i class="fas fa-save mr-2"></i>Lưu Khoản Chi';
    } else {
        addExpense(name, amount, paidBy, participants, isEqualSplit, paidBySplitMode, paidByAmounts);
    }
    
    resetForm();
    updateDisplay();
}

function handleEditExpense(id) {
    const expense = appState.expenses.find(e => e.id === id);
    if (!expense) return;
    
    editingExpenseId = id; // Gắn cờ Edit thay vì Xóa ngay lập tức
    
    document.getElementById('expenseName').value = expense.name;
    document.getElementById('expenseAmount').value = expense.amount;
    
    // Set paidBy
    document.querySelectorAll('.paidBy-checkbox').forEach(cb => {
        cb.checked = expense.paidBy.includes(cb.value);
    });
    
    if (expense.paidBySplitMode === 'custom') {
        document.getElementById('paidBySplitCustom').checked = true;
    } else {
        document.getElementById('paidBySplitEqual').checked = true;
    }
    
    updatePaidBySplitModeVisibility();
    
    // Fill custom paidAmounts if exist
    if (expense.paidBySplitMode === 'custom' && expense.paidByAmounts) {
        document.querySelectorAll('.paidByAmount-input').forEach(input => {
            const payer = input.getAttribute('data-payer');
            if (expense.paidByAmounts[payer] !== undefined) {
                input.value = expense.paidByAmounts[payer];
            }
        });
        updatePaidByAmountsTotal();
    }
    
    // Set participants
    document.querySelectorAll('.participant-checkbox').forEach(cb => {
        const isParticipant = expense.participants.some(p => p.name === cb.value);
        cb.checked = isParticipant;
        
        if (!expense.isEqualSplit && isParticipant) {
            const share = expense.participants.find(p => p.name === cb.value).share;
            document.getElementById(`share_${cb.value}`).value = share;
        }
    });
    
    if (expense.isEqualSplit) {
        document.getElementById('splitEqual').checked = true;
    } else {
        document.getElementById('splitCustom').checked = true;
    }
    
    updateSplitMode();
    
    // Đổi UI Submit Button
    const submitBtn = document.querySelector('button[type="submit"]');
    submitBtn.innerHTML = '<i class="fas fa-edit mr-2"></i>Cập Nhật Khoản Chi';
    submitBtn.classList.add('animate-pulse');
    setTimeout(() => submitBtn.classList.remove('animate-pulse'), 1000);
    
    document.getElementById('expenseForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function handleDeleteExpense(id) {
    if (confirm('Bạn chắc chắn muốn xóa chi tiêu này?')) {
        deleteExpense(id);
        if (editingExpenseId === id) resetForm(); // Nếu đang sửa mà xóa thì dọn form luôn
        updateDisplay();
    }
}

function resetForm() {
    document.getElementById('expenseForm').reset();
    document.getElementById('splitEqual').checked = true;
    document.getElementById('paidBySplitEqual').checked = true;
    editingExpenseId = null;
    
    const submitBtn = document.querySelector('button[type="submit"]');
    submitBtn.innerHTML = '<i class="fas fa-save mr-2"></i>Lưu Khoản Chi';
    
    updateDisplay(); // Chạy lại để reset checkbox về mặc định
}

function handleTabSwitch(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(tabName + 'Tab').classList.remove('hidden');
    event.currentTarget.classList.add('active');
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadState();
    
    const expenseForm = document.getElementById('expenseForm');
    expenseForm.addEventListener('submit', handleAddExpense);
    
    // Bắt sự kiện Reset form
    expenseForm.addEventListener('reset', (e) => {
        e.preventDefault();
        resetForm();
    });
    
    document.getElementById('expenseAmount').addEventListener('input', updatePaidByAmountsTotal);
    
    document.getElementById('addMemberBtn').addEventListener('click', () => {
        const input = document.getElementById('newMemberName');
        if (input.value.trim()) handleAddMember();
    });
    
    document.getElementById('newMemberName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddMember();
        }
    });
    
    document.getElementById('splitEqual').addEventListener('change', updateSplitMode);
    document.getElementById('splitCustom').addEventListener('change', updateSplitMode);
    
    document.getElementById('paidBySplitEqual').addEventListener('change', updatePaidByAmountsDisplay);
    document.getElementById('paidBySplitCustom').addEventListener('change', updatePaidByAmountsDisplay);
    
    // Thay vì gắn event inline, sử dụng Event Delegation cho các checkbox tạo động
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('participant-checkbox')) {
            updateSplitMode();
        }
        if (e.target.classList.contains('paidBy-checkbox')) {
            updatePaidBySplitModeVisibility();
        }
    });
    
    // UI Logic cho Tab bên phải (override code trong thẻ <script> của HTML)
    document.querySelectorAll('button[data-tab]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabName = btn.dataset.tab;
            document.querySelectorAll('button[data-tab]').forEach(b => {
                b.style.background = 'transparent';
                b.style.color = '#64748b';
                b.style.boxShadow = 'none';
            });
            btn.style.background = 'white';
            btn.style.color = '#0f766e';
            btn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
            
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(tabName + 'Tab').classList.remove('hidden');
        });
    });
    
    updateDisplay();
});