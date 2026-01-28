// ============================================
// STATE MANAGEMENT
// ============================================

const appState = {
    members: ['Lạc', 'Minh', 'Duy', 'Hào', 'Quý', 'Kiệt', 'Hoàng'],
    expenses: []
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatCurrency(value) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value);
}

function roundAmount(amount) {
    return Math.round(amount);
}

// ============================================
// DATA OPERATIONS
// ============================================

function addMember(name) {
    if (!name || name.trim() === '') {
        alert('Vui lòng nhập tên thành viên');
        return false;
    }
    if (appState.members.includes(name)) {
        alert('Thành viên này đã tồn tại');
        return false;
    }
    appState.members.push(name);
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

function addExpense(name, amount, paidBy, participants, isEqualSplit) {
    const expense = {
        id: Date.now(),
        name,
        amount: roundAmount(amount),
        paidBy, // Array of names
        participants,
        isEqualSplit,
        date: new Date().toLocaleDateString('vi-VN')
    };
    appState.expenses.push(expense);
    saveState();
    return expense;
}

function updateExpense(id, name, amount, paidBy, participants, isEqualSplit) {
    const expense = appState.expenses.find(e => e.id === id);
    if (expense) {
        expense.name = name;
        expense.amount = roundAmount(amount);
        expense.paidBy = paidBy;
        expense.participants = participants;
        expense.isEqualSplit = isEqualSplit;
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
    
    // Initialize all members
    appState.members.forEach(member => {
        personSummary[member] = {
            name: member,
            totalPaid: 0,
            totalShare: 0,
            balance: 0
        };
    });
    
    // Calculate totals
    appState.expenses.forEach(expense => {
        const amount = expense.amount;
        const numPaidBy = expense.paidBy.length;
        const amountPerPayer = roundAmount(amount / numPaidBy);
        
        // Add to paid amount for each payer
        expense.paidBy.forEach(payer => {
            personSummary[payer].totalPaid += amountPerPayer;
        });
        
        // Add to share for each participant
        if (expense.isEqualSplit) {
            const sharePerPerson = roundAmount(amount / expense.participants.length);
            expense.participants.forEach(p => {
                personSummary[p.name].totalShare += sharePerPerson;
            });
        } else {
            expense.participants.forEach(p => {
                personSummary[p.name].totalShare += p.share;
            });
        }
    });
    
    // Calculate balance
    Object.values(personSummary).forEach(person => {
        person.balance = person.totalPaid - person.totalShare;
    });
    
    return personSummary;
}

function simplifyTransactions(personSummary) {
    const transactions = [];
    const balances = {};
    
    // Get balances
    Object.values(personSummary).forEach(person => {
        if (person.balance !== 0) {
            balances[person.name] = person.balance;
        }
    });
    
    // Simplify using greedy algorithm
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
        
        if (Math.abs(balances[debtorName]) < 0.01) delete balances[debtorName];
        if (Math.abs(balances[creditorName]) < 0.01) delete balances[creditorName];
    }
    
    return transactions;
}

// ============================================
// VALIDATION
// ============================================

function validateExpenseForm(name, amount, paidBy, participants, isEqualSplit) {
    const errors = [];
    
    if (!name || name.trim() === '') {
        errors.push('Vui lòng nhập tên chi tiêu');
    }
    
    if (!amount || amount <= 0) {
        errors.push('Vui lòng nhập số tiền hợp lệ');
    }
    
    if (!paidBy || paidBy.length === 0) {
        errors.push('Vui lòng chọn người trả tiền');
    }
    
    if (!participants || participants.length === 0) {
        errors.push('Vui lòng chọn người tham gia');
    }
    
    if (isEqualSplit) {
        if (participants.length === 0) {
            errors.push('Phải có ít nhất 1 người tham gia');
        }
    } else {
        const total = participants.reduce((sum, p) => sum + (p.share || 0), 0);
        const roundedAmount = roundAmount(amount);
        const roundedTotal = roundAmount(total);
        
        if (roundedTotal !== roundedAmount) {
            errors.push(`Tổng số tiền chia phải bằng ${formatCurrency(roundedAmount)}. Hiện tại: ${formatCurrency(roundedTotal)}`);
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
    
    // Save current paid by selections
    const currentPaidBy = new Set();
    document.querySelectorAll('.paidBy-checkbox:checked').forEach(checkbox => {
        currentPaidBy.add(checkbox.value);
    });
    
    membersList.innerHTML = '';
    paidByList.innerHTML = '';
    participantsList.innerHTML = '';
    
    appState.members.forEach(member => {
        // Members list
        const memberItem = document.createElement('div');
        memberItem.className = 'flex justify-between items-center p-3 bg-gray-50 rounded-lg';
        memberItem.innerHTML = `
            <span class="font-medium text-gray-800">${member}</span>
            <button class="btn-danger text-sm" onclick="handleRemoveMember('${member}')">
                <i class="fas fa-trash mr-1"></i>Xóa
            </button>
        `;
        membersList.appendChild(memberItem);
        
        // Paid by checkbox
        const paidByItem = document.createElement('label');
        paidByItem.className = 'flex items-center cursor-pointer p-2 hover:bg-gray-100 rounded';
        const isChecked = currentPaidBy.has(member) ? 'checked' : '';
        paidByItem.innerHTML = `
            <input type="checkbox" class="paidBy-checkbox mr-3" value="${member}" ${isChecked}>
            <span class="text-sm font-medium text-gray-700">${member}</span>
        `;
        paidByList.appendChild(paidByItem);
        
        // Participants checkbox
        const participantItem = document.createElement('label');
        participantItem.className = 'flex items-center cursor-pointer p-2 hover:bg-gray-100 rounded';
        participantItem.innerHTML = `
            <input type="checkbox" class="participant-checkbox mr-3" value="${member}" checked>
            <span class="text-sm font-medium text-gray-700 flex-1">${member}</span>
            <input type="number" id="share_${member}" class="share-input hidden w-20 px-2 py-1 border border-gray-300 rounded text-right" placeholder="0" min="0" step="1000">
        `;
        participantsList.appendChild(participantItem);
    });
    
    updateSplitMode();
}

function renderExpenses() {
    const expensesList = document.getElementById('expensesList');
    expensesList.innerHTML = '';
    
    if (appState.expenses.length === 0) {
        expensesList.innerHTML = '<p class="text-gray-500 text-center py-8">Chưa có chi tiêu nào</p>';
        return;
    }
    
    appState.expenses.forEach(expense => {
        const expenseCard = document.createElement('div');
        expenseCard.className = 'card bg-white p-4 mb-3';
        
        const paidByText = expense.paidBy.join(', ');
        const participantsText = expense.participants.map(p => p.name).join(', ');
        
        expenseCard.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h3 class="font-semibold text-gray-800">${expense.name}</h3>
                    <p class="text-sm text-gray-600">Người trả: ${paidByText}</p>
                </div>
                <div class="text-right">
                    <p class="font-bold text-lg text-green-600">${formatCurrency(expense.amount)}</p>
                    <p class="text-xs text-gray-500">${expense.date}</p>
                </div>
            </div>
            <p class="text-sm text-gray-600 mb-3">Tham gia: ${participantsText}</p>
            <div class="flex gap-2">
                <button class="btn-secondary text-sm flex-1" onclick="handleEditExpense(${expense.id})">
                    <i class="fas fa-edit mr-1"></i>Sửa
                </button>
                <button class="btn-danger text-sm flex-1" onclick="handleDeleteExpense(${expense.id})">
                    <i class="fas fa-trash mr-1"></i>Xóa
                </button>
            </div>
        `;
        
        expensesList.appendChild(expenseCard);
    });
}

function renderSettlement() {
    const settlementTab = document.getElementById('settlementTab');
    const personSummary = calculateExpenses();
    const transactions = simplifyTransactions(personSummary);
    
    let html = '<div class="space-y-6">';
    
    // Person summary
    html += '<div><h3 class="text-lg font-bold text-gray-800 mb-4">Tóm tắt cá nhân</h3>';
    html += '<div class="space-y-3">';
    
    Object.values(personSummary).forEach(person => {
        const balanceClass = person.balance > 0 ? 'text-green-600' : person.balance < 0 ? 'text-red-600' : 'text-gray-600';
        const balanceText = person.balance > 0 ? `Được trả ${formatCurrency(person.balance)}` : 
                           person.balance < 0 ? `Nợ ${formatCurrency(Math.abs(person.balance))}` : 'Bình hòa';
        
        html += `
            <div class="card bg-white p-4">
                <div class="flex justify-between items-center mb-2">
                    <h4 class="font-semibold text-gray-800">${person.name}</h4>
                    <span class="font-bold ${balanceClass}">${balanceText}</span>
                </div>
                <div class="grid grid-cols-2 gap-4 text-sm text-gray-600">
                    <div>Đã trả: <span class="font-semibold text-gray-800">${formatCurrency(person.totalPaid)}</span></div>
                    <div>Phải trả: <span class="font-semibold text-gray-800">${formatCurrency(person.totalShare)}</span></div>
                </div>
            </div>
        `;
    });
    
    html += '</div></div>';
    
    // Transactions
    html += '<div><h3 class="text-lg font-bold text-gray-800 mb-4">Giao dịch cần thực hiện</h3>';
    
    if (transactions.length === 0) {
        html += '<p class="text-gray-500 text-center py-8">Mọi người đã bình hòa!</p>';
    } else {
        html += '<div class="space-y-2">';
        transactions.forEach((tx, index) => {
            html += `
                <div class="card bg-white p-4">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3 flex-1">
                            <span class="font-semibold text-gray-800">${tx.from}</span>
                            <i class="fas fa-arrow-right text-gray-400"></i>
                            <span class="font-semibold text-gray-800">${tx.to}</span>
                        </div>
                        <span class="font-bold text-green-600">${formatCurrency(tx.amount)}</span>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }
    
    html += '</div></div>';
    
    settlementTab.innerHTML = html;
}

function updateDisplay() {
    renderMembers();
    renderExpenses();
    renderSettlement();
}

// ============================================
// SPLIT MODE HANDLING
// ============================================

function updateSplitMode() {
    const isEqualSplit = document.getElementById('splitEqual').checked;
    const labels = document.querySelectorAll('#participantsList label');
    
    labels.forEach(label => {
        const checkbox = label.querySelector('.participant-checkbox');
        const shareInput = label.querySelector('.share-input');
        
        if (shareInput) {
            if (isEqualSplit) {
                shareInput.classList.add('hidden');
            } else if (checkbox && checkbox.checked) {
                shareInput.classList.remove('hidden');
            } else {
                shareInput.classList.add('hidden');
            }
        }
    });
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
    if (confirm(`Bạn chắc chắn muốn xóa ${name}?`)) {
        removeMember(name);
        updateDisplay();
    }
}

function handleAddExpense(event) {
    event.preventDefault();
    
    const name = document.getElementById('expenseName').value;
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    
    // Get paid by (multiple)
    const paidByCheckboxes = document.querySelectorAll('.paidBy-checkbox:checked');
    const paidBy = Array.from(paidByCheckboxes).map(cb => cb.value);
    
    const isEqualSplit = document.getElementById('splitEqual').checked;
    
    const selectedCheckboxes = document.querySelectorAll('.participant-checkbox:checked');
    const participants = [];
    
    selectedCheckboxes.forEach(checkbox => {
        const share = isEqualSplit ? 0 : roundAmount(parseFloat(document.getElementById(`share_${checkbox.value}`).value) || 0);
        participants.push({
            name: checkbox.value,
            share: share
        });
    });
    
    const errors = validateExpenseForm(name, amount, paidBy, participants, isEqualSplit);
    
    if (errors.length > 0) {
        alert('Lỗi:\n' + errors.join('\n'));
        return;
    }
    
    addExpense(name, amount, paidBy, participants, isEqualSplit);
    document.getElementById('expenseForm').reset();
    document.getElementById('splitEqual').checked = true;
    updateDisplay();
}

function handleEditExpense(id) {
    const expense = appState.expenses.find(e => e.id === id);
    if (!expense) return;
    
    document.getElementById('expenseName').value = expense.name;
    document.getElementById('expenseAmount').value = expense.amount;
    
    // Set paid by checkboxes
    document.querySelectorAll('.paidBy-checkbox').forEach(checkbox => {
        checkbox.checked = expense.paidBy.includes(checkbox.value);
    });
    
    // Set participant checkboxes and shares
    document.querySelectorAll('.participant-checkbox').forEach(checkbox => {
        const isParticipant = expense.participants.some(p => p.name === checkbox.value);
        checkbox.checked = isParticipant;
        
        if (!expense.isEqualSplit && isParticipant) {
            const share = expense.participants.find(p => p.name === checkbox.value).share;
            document.getElementById(`share_${checkbox.value}`).value = share;
        }
    });
    
    if (expense.isEqualSplit) {
        document.getElementById('splitEqual').checked = true;
    } else {
        document.getElementById('splitCustom').checked = true;
    }
    
    updateSplitMode();
    updateDisplay();
    
    deleteExpense(id);
    document.getElementById('expenseForm').scrollIntoView({ behavior: 'smooth' });
}

function handleDeleteExpense(id) {
    if (confirm('Bạn chắc chắn muốn xóa chi tiêu này?')) {
        deleteExpense(id);
        updateDisplay();
    }
}

function handleTabSwitch(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(tabName + 'Tab').classList.remove('hidden');
    event.target.closest('.tab-button').classList.add('active');
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    loadState();
    
    const expenseForm = document.getElementById('expenseForm');
    expenseForm.addEventListener('submit', handleAddExpense);
    
    document.getElementById('addMemberBtn').addEventListener('click', () => {
        const input = document.getElementById('newMemberName');
        if (input.value.trim()) {
            handleAddMember();
        }
    });
    
    document.getElementById('newMemberName').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleAddMember();
        }
    });
    
    document.getElementById('splitEqual').addEventListener('change', updateSplitMode);
    document.getElementById('splitCustom').addEventListener('change', updateSplitMode);
    
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('participant-checkbox')) {
            updateSplitMode();
        }
    });
    
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            handleTabSwitch(btn.dataset.tab);
        });
    });
    
    updateDisplay();
});
