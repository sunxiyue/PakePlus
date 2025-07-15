// app.js  
let wellData = [];
let selectedRows = new Set();
const APP_VERSION = "0.2.17";
const DATA_EXPIRY_DAYS = 5;  // 数据提醒天数
let currentGroupFilter = '';
let currentReportDate = null; // 新增日期变量
let currentStatusFilter = '';
let isHourMode = localStorage.getItem('isHourMode') === 'true';


const COLUMN_INDEX = (function() {
    return {
        FILE: {
GROUP: 1, // B列
NUMBER: 2, // C列
LIQUID: 15, // P列
OIL: 16, // Q列
WATER: 17, // R列
GAS: 18, // S列
NOTE: 26 // AA列    
        },
        TABLE: {
            GROUP: 0,
            NUMBER: 1,
            STATUS: 2,
            VALVE: 3,
            STOP_TIME: 4,
            START_TIME: 5,
            LIQUID: 6,
            OIL: 7,
            WATER: 8,
            GAS: 9,
            NOTE: 10 
        }
    };
})();

const GROUP_MERGE_RULES = {
  'CB4EA/B/GX605': ['CB4EA', 'CB4EB', 'CBGX605'],
  'CB246A/SHG1': ['CB246A', 'SHG1'],
  'SH201A/B': ['SH201A', 'SH201B'],
  'CB4DA/B': ['CB4DA', 'CB4DB'],
  'CB208A/B': ['CB208A', 'CB208B'],
  'CB1FA/B/C': ['CB1FA', 'CB1FB', 'CB1FC'],
  'CB1HA/B': ['CB1HA', 'CB1HB'],
  'CB6FA/B/X212': ['CB6FA', 'CB6FB', 'CBX212'],
  'CB6GA/B': ['CB6GA', 'CB6GB'],
  'CB6E/1A-N2': ['CB6E'],
  'CB22FA/B/C': ['CB22FA', 'CB22FB', 'CB22FC'],
  'CB26A/B': ['CB26A', 'CB26B']
};

document.addEventListener('DOMContentLoaded',   init);

function init() {
    loadSavedData();
    checkDataExpiry();
    renderTable();
    updateStatistics();
    updateGlobalStats();
    
    // 新增状态筛选事件
    document.getElementById('statusFilter').addEventListener('change', function() {
        currentStatusFilter = this.value;
        handleFilterChange();
    });
    
    // +++ 新增日期显示初始化 +++
    const dateDisplay = document.getElementById('dataDateDisplay'); 
    if (currentReportDate) {
        dateDisplay.textContent  = `数据日期：${currentReportDate}`;
        dateDisplay.style.color  = '';
    } else {
        dateDisplay.textContent  = '数据日期：未识别';
        dateDisplay.style.color  = 'red';
    }
    // ++++++++++++++++++++++++
    
    document.getElementById('selectAll').addEventListener('change',  function(e) {
        toggleAllRows(e.target.checked);  
    });
    
    initGroupFilter();
}

// 新增处理筛选变化的通用函数
function handleFilterChange() {
    // 如果当前没有数据，强制重置筛选
    if (wellData.length === 0) {
        currentGroupFilter = '';
        currentStatusFilter = '';
        document.getElementById('groupFilter').value = '';
        document.getElementById('statusFilter').value = '';
        return;
    }

    // 获取实际需要匹配的井组列表
    let actualGroups = [currentGroupFilter];
    if (GROUP_MERGE_RULES[currentGroupFilter]) {
        actualGroups = GROUP_MERGE_RULES[currentGroupFilter];
    }

    // 状态过滤条件（新增长停井处理）
    const statusFilterFn = (well) => {
        if (currentStatusFilter === 'long') {
            return well.isLongStop;
        } else if (well.isLongStop) {
            return false;
        }
        
        if (!currentStatusFilter) return true;
        return well.status === parseInt(currentStatusFilter);
    };

    // 核心修改：自动全选/清除逻辑
    const isSpecificStatus = ![null, '', 'long'].includes(currentStatusFilter);
    const prevSelected = new Set(selectedRows);

    // 重置选中逻辑
    selectedRows.clear();

    wellData.forEach((w, i) => {
        const groupMatch = currentGroupFilter ? 
            actualGroups.includes(w.group) : true;
        const statusMatch = statusFilterFn(w);
        
        if (groupMatch && statusMatch && !w.isLongStop) {
            // 自动全选条件：当前是具体状态筛选 且 (之前已选中 或 需要自动选中)
            if (isSpecificStatus || prevSelected.has(i)) {
                selectedRows.add(i);
            }
        }
    });

    // 特殊处理：切回全部状态时清除所有选择
    if (!currentStatusFilter && !currentGroupFilter) {
        selectedRows.clear();
    }

    renderTable();
    updateSelectAllState();
}

function clearSelections() {
    selectedRows.clear(); 
    document.getElementById('selectAll').checked = false;
}

// 新增清除选择状态的通用函数
function initGroupFilter() {
  const groups = wellData.map(w => w.group);
  const mergedGroups = new Set();

  // 应用合并规则
  groups.forEach(originalGroup => {
    let merged = false;
    for (const [mergedName, patterns] of Object.entries(GROUP_MERGE_RULES)) {
      if (patterns.includes(originalGroup)) {
        mergedGroups.add(mergedName);
        merged = true;
        break;
      }
    }
    if (!merged) mergedGroups.add(originalGroup);
  });

  // 生成筛选选项
  const filter = document.getElementById('groupFilter');
  filter.innerHTML = '<option value="">全部井组</option>';
  Array.from(mergedGroups).sort().forEach(g => {
    const option = document.createElement('option');
    option.value = g;
    option.textContent = g;
    filter.appendChild(option);
  });

  // 修改后的筛选事件处理
  filter.addEventListener('change', function() {
    currentGroupFilter = this.value;
    selectedRows.clear(); // 切换井组时清除选中
    
    // 获取实际匹配的井组列表
    let actualGroups = [currentGroupFilter];
    if (GROUP_MERGE_RULES[currentGroupFilter]) {
      actualGroups = GROUP_MERGE_RULES[currentGroupFilter];
    }

    if (currentGroupFilter) {
      wellData.forEach((w, i) => {
        if (actualGroups.includes(w.group) && !w.isLongStop) {
          selectedRows.add(i);
        }
      });
    }

	 handleFilterChange();
    renderTable();
    updateSelectAllState();
  });
}

function showInstructions() {
    new bootstrap.Modal(document.getElementById('instructionModal')).show();  
}

function saveData() {
    localStorage.setItem('wellData',  JSON.stringify(wellData)); 
    localStorage.setItem('reportDate',  currentReportDate);  // 保存识别出的报告日期
    // 移除原有的dataSavedTime存储
}

function loadSavedData() {
    const saved = localStorage.getItem('wellData'); 
    if (saved) wellData = JSON.parse(saved); 
    currentReportDate = localStorage.getItem('reportDate');  
    // 删除原有的dataSavedTime加载 
}
document.getElementById('excelFile').addEventListener('change',   handleFileUpload);

function handleFileUpload(e) {
    const file = e.target.files[0]; 
    if (!file) return;

    const validTypes = [
        'application/vnd.ms-excel', 
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
    ];

    if (!validTypes.includes(file.type))  {
        alert('仅支持.xls和.xlsx格式');
        return;
    }

    const reader = new FileReader();
    reader.onload  = processExcelFile;
    reader.readAsArrayBuffer(file); 
}

function processExcelFile(e) {
    try {
        const data = new Uint8Array(e.target.result);  
        const workbook = XLSX.read(data,   {
            type: 'array',
            cellDates: true,
            cellNF: true
        });

        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const rawData = XLSX.utils.sheet_to_json(worksheet,   {
            header: 1,
            raw: false,
            defval: ''
        });

        processExcelData(rawData);
        clearSelections();

        // +++ 新增重置筛选状态逻辑 +++
        currentGroupFilter = ''; // 重置筛选状态
        document.getElementById('groupFilter').value  = ''; // 重置下拉菜单
        // ++++++++++++++++++++++++++++

        renderTable();
        saveData();
    } catch (error) {
        console.error(' 文件处理错误:', error);
        alert('文件解析失败，请检查文件格式');
    }
}

function processExcelData(data) {
    // 新增日期处理逻辑
    try {
        // 使用更灵活的正则表达式
        const dateString = data.flat().find(cell  => 
            /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(cell)
        );
        const dateMatch = dateString?.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
        
        if (dateMatch) {
            currentReportDate = `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`;
        } else {
            currentReportDate = null;
        }
    } catch {
        currentReportDate = null;
    }
    
    // 更新日期显示
    const dateDisplay = document.getElementById('dataDateDisplay');
    if (currentReportDate) {
        dateDisplay.textContent = `数据日期：${currentReportDate}`;
        dateDisplay.style.color = ''; // 重置颜色
    } else {
        dateDisplay.textContent = '数据日期：未识别';
        dateDisplay.style.color = 'red';
    }
    const newData = [];
    const fileCol = COLUMN_INDEX.FILE;
    
    const groupMap = new Map();
    let currentGroup = '';
    
    // 第一遍循环建立groupMap
    for (let i = 3; i < data.length;  i++) {
        const row = data[i];
        const cellValue = row[fileCol.GROUP] ? String(row[fileCol.GROUP]).trim() : '';
        currentGroup = cellValue !== '' ? cellValue : currentGroup;
        groupMap.set(i,  currentGroup.replace(/CA/g,  ''));
    }

    // 第二遍循环处理数据
    for (let i = 3; i < data.length;  i++) {
        const row = data[i];
        if (!row || !row[fileCol.NUMBER]) continue;

        let group = groupMap.get(i)  || '';
        let number = String(row[fileCol.NUMBER]).trim().replace(/CA/g, '');

        // 特殊处理CB1A-N2
        if (number === 'CB1A-N2') {
            group = 'CB6E'; // 强制修改井组
        }

        if (/(小计|合计)$/.test(number)) continue;

        const existing = wellData.find(w  => w.number  === number) || { valve: '否' };

        newData.push({   
            group: group,
            number: number,
            liquid: parseNumber(row[fileCol.LIQUID]),
            oil: parseNumber(row[fileCol.OIL]),
            water: parseNumber(row[fileCol.WATER]),
            gas: parseNumber(row[fileCol.GAS]),
            note: String(row[fileCol.NOTE] || '').trim(),
            status: 0,
            valve: existing.valve  || '否',
            stopTime: '',
            startTime: '',
            isLongStop: parseNumber(row[fileCol.OIL]) === 0
        });
    }
    
    // 更新数据
    wellData = newData;

    // 处理CB1A-N2的位置（新增逻辑）
    let cb1aN2Index = wellData.findIndex(w  => w.number  === 'CB1A-N2');
    if (cb1aN2Index !== -1) {
        // 提取目标井数据
        const [targetWell] = wellData.splice(cb1aN2Index,  1);
        
        // 查找CB6E组的最后一个索引
        let insertIndex = wellData.reduce((acc,  well, index) => {
            return well.group  === 'CB6E' ? index : acc;
        }, -1);

        if (insertIndex !== -1) {
            // 如果找到CB6E组，插入到该组末尾
            wellData.splice(insertIndex  + 1, 0, targetWell);
        } else {
            // 没有找到则插入到整个数组末尾
            wellData.push(targetWell); 
        }
    }
    initGroupFilter(); // 刷新井组筛选
    currentGroupFilter = '';
    currentStatusFilter = '';
    document.getElementById('groupFilter').value = '';
    document.getElementById('statusFilter').value = '';
    handleFilterChange();
}

function calculateTimeDiff(stopTime, startTime) {
    if (!stopTime || !startTime) return 0;
    
    const [stopH, stopM] = stopTime.split(':').map(Number);   
    const [startH, startM] = startTime.split(':').map(Number);   
    
    const stopMinutes = stopH * 60 + stopM;
    const startMinutes = startH * 60 + startM;
    
    let diffMinutes = startMinutes - stopMinutes;
    if (diffMinutes < 0) {
        diffMinutes += 24 * 60;
    }
    
    return diffMinutes / 60 / 24;
}

function renderTable() {
  const tbody = document.getElementById('tableBody');  
  if (!tbody) return;

  // 获取实际需要匹配的井组列表
  let actualGroups = [currentGroupFilter];
  if (GROUP_MERGE_RULES[currentGroupFilter]) {
    actualGroups = GROUP_MERGE_RULES[currentGroupFilter];
  }

  // 状态过滤条件
  const statusFilterFn = (well) => {
    if (!currentStatusFilter) return true;
    if (currentStatusFilter === 'long') return well.isLongStop;
    return well.status === parseInt(currentStatusFilter);
  };

  // 双重过滤
  const filteredData = wellData.filter(w => {
    const groupMatch = currentGroupFilter ? 
      actualGroups.includes(w.group) : true;
    return groupMatch && statusFilterFn(w);
  });

  const groups = [];
  let currentGroup = null;
  let currentGroupData = [];
  
  for (const well of filteredData) {
    if (well.group !== currentGroup) {
      if (currentGroup !== null) {
        groups.push(currentGroupData);   
      }
      currentGroup = well.group;   
      currentGroupData = [well];
    } else {
      currentGroupData.push(well);   
    }
  }
  groups.push(currentGroupData);   

  let html = '';
  let rowIndex = 0;

  groups.forEach(group => {
    const isEntireGroupLongStop = group.every(w => w.isLongStop);   
    const groupSize = group.length;   
    const groupStatus = getGroupStatus(group);
    const groupStatusText = ['井组正常', '井组全停', '井组全开'][groupStatus] || '井组正常';
    const groupStatusClass = ['group-normal', 'group-stopped', 'group-started'][groupStatus] || '';

    group.forEach((well, indexInGroup) => {
      rowIndex++;
      const statusClass = getStatusClass(well.status, well.isLongStop);   
      const statusText = getStatusText(well.status, well.isLongStop);   
      const isDisabled = well.isLongStop ? 'disabled' : '';
      const dataIndex = wellData.indexOf(well); // 保持使用原始索引

      const rowClasses = [
        isEntireGroupLongStop ? 'long-stop-group' : '',
        'text-center'
      ].filter(c => c).join(' ');

      html += `
        <tr class="${rowClasses}">
          <td>
            <input type="checkbox" class="row-checkbox" 
                ${well.isLongStop   ? 'disabled' : ''}
                ${selectedRows.has(dataIndex)   ? 'checked' : ''}
                onchange="toggleRowSelection(${dataIndex})">
          </td>
          <td>${rowIndex}</td>
          ${indexInGroup === 0 
            ? `<td rowspan="${groupSize}">
                <div>${well.group}</div>    
                <button class="btn btn-sm ${groupStatusClass} mt-1" 
                        onclick="toggleGroupStatus('${well.group}',    ${groupStatus})"
                        ${isEntireGroupLongStop ? 'disabled' : ''}>
                  ${groupStatusText}
                </button>
               </td>`  
            : ''}
          <td>${well.number}</td>     
          <td class="${statusClass} status-cell" 
              ${well.isLongStop    ? 'title="长停井不可操作"' : `onclick="toggleStatus(${dataIndex})"`}>
            ${statusText}
          </td>
          <td>
            <select class="form-select" ${isDisabled} 
                    onchange="updateValve(${dataIndex}, this.value)">     
              <option ${well.valve    === '是' ? 'selected' : ''}>是</option>
              <option ${well.valve    === '否' ? 'selected' : ''}>否</option>
            </select>
          </td>
          ${isHourMode ? `
            <td colspan="2">
              <input type="number" min="0" step="0.01" class="form-control hour-mode" style="" 
                value="${well.hours !== undefined ? well.hours : ''}"
                ${well.isLongStop ? 'disabled' : ''}
                onchange="updateHours(${dataIndex}, this.value)">
            </td>
          ` : `
          <td>
            <input type="time" class="form-control" 
                   value="${well.stopTime}"     
                   ${well.status    !== 1 && well.status    !== 2 ? 'disabled' : ''}
                   onchange="updateStopTime(${dataIndex}, this.value)">     
          </td>
          <td>
            <input type="time" class="form-control"
                   value="${well.startTime}"     
                   ${well.status    !== 2 ? 'disabled' : ''}
                   onchange="updateStartTime(${dataIndex}, this.value)">     
          </td>
          `}
          <td>${well.liquid.toFixed(1)}</td>     
          <td>${well.oil.toFixed(1)}</td>     
          <td>${well.water.toFixed(1)}</td>     
          <td style="font-size: 1em">${well.gas.toFixed(0)}</td>    
          <td class="note-cell" title="${well.note || '无'}">${well.note}</td>    
        </tr>
      `;
    });
  });

  tbody.innerHTML    = html;
  updateStatistics();
  updateGlobalStats();
  updateSelectAllState(); // 新增调用
}

// 新增全选状态同步函数
function updateSelectAllState() {
    const selectAllCheckbox = document.getElementById('selectAll'); 
    
    // 获取当前可见行索引（排除长停井）
    const visibleIndexes = wellData
        .map((well, index) => ({ well, index }))
        .filter(({ well }) => {
            if (well.isLongStop) return false; // 排除长停井
            
            let actualGroups = [currentGroupFilter];
            if (GROUP_MERGE_RULES[currentGroupFilter]) {
                actualGroups = GROUP_MERGE_RULES[currentGroupFilter];
            }
            
            const groupMatch = currentGroupFilter ? 
                actualGroups.includes(well.group) : true;
            const statusMatch = (well) => {
                if (!currentStatusFilter) return true;
                if (currentStatusFilter === 'long') return false;
                return well.status === parseInt(currentStatusFilter);
            };
            
            return groupMatch && statusMatch(well);
        })
        .map(({ index }) => index);

    const allSelected = visibleIndexes.length > 0 && 
        visibleIndexes.every(i => selectedRows.has(i));

    selectAllCheckbox.checked = allSelected;
    selectAllCheckbox.disabled = visibleIndexes.length === 0;
}

function toggleRowSelection(index) {
  if (selectedRows.has(index))  {
    selectedRows.delete(index); 
  } else {
    selectedRows.add(index); 
  }
  updateSelectAllState(); // 新增调用
}

// 修正后的全选操作函数 
function toggleAllRows(checked) {
    selectedRows.clear();
    
    if (checked) {
        // 获取当前可见行（已过滤后的数据）且排除长停井
        const visibleIndexes = wellData
            .map((well, index) => ({ well, index }))
            .filter(({ well }) => {
                if (well.isLongStop) return false; // 新增：排除长停井
                
                let actualGroups = [currentGroupFilter];
                if (GROUP_MERGE_RULES[currentGroupFilter]) {
                    actualGroups = GROUP_MERGE_RULES[currentGroupFilter];
                }
                
                const groupMatch = currentGroupFilter ? 
                    actualGroups.includes(well.group) : true;
                const statusMatch = (well) => {
                    if (!currentStatusFilter) return true;
                    if (currentStatusFilter === 'long') return false; // 长停井不参与全选
                    return well.status === parseInt(currentStatusFilter);
                };
                
                return groupMatch && statusMatch(well);
            })
            .map(({ index }) => index);

        visibleIndexes.forEach(i => selectedRows.add(i));
    }
    
    renderTable();
    updateSelectAllState();
}
 
// 修正后的筛选事件处理 
document.getElementById('groupFilter').addEventListener('change', function() {
    currentGroupFilter = this.value;
    handleFilterChange();
});

document.getElementById('statusFilter').addEventListener('change', function() {
    const prevStatus = currentStatusFilter;
    currentStatusFilter = this.value;

    // 从具体状态切到全部状态时清除选中
    if (prevStatus && ![null, '', 'long'].includes(prevStatus) && !currentStatusFilter) {
        selectedRows.clear();
    }

    handleFilterChange();
});

// 在调用函数前定义showToast（重要！）
function showToast(message, type = 'info') {
    const toast = document.createElement('div'); 
    toast.className  = `toast alert-${type}`;
    toast.innerHTML  = `
        <div class="toast-body d-flex align-items-center">
            <span class="flex-grow-1">${message}</span>
            <button type="button" class="btn-close" 
                onclick="this.parentElement.parentElement.remove()"></button> 
        </div>
    `;
    
    // 移除旧提示
    document.querySelectorAll('.toast').forEach(t  => t.remove()); 
    
    document.body.appendChild(toast); 
    setTimeout(() => toast.classList.add('show'),  10);
    setTimeout(() => {
        toast.classList.remove('show'); 
        setTimeout(() => toast.remove(),  150);
    }, 1000);
}

// 新增批量操作函数
function batchToggleStatus(newStatus) {
    if (selectedRows.size === 0) {
        showToast('请勾选需要操作的油井', 'danger');
        return;
    }

    // 获取所有选中井数据
    const selectedWells = [...selectedRows].map(i => wellData[i]);
    
    // 批量关井逻辑（状态1）
    if (newStatus === 1) {
        // 检查是否有已开井状态（状态2）
        const hasStarted = selectedWells.some(w => w.status === 2);
        // 检查是否全部为停井中状态（状态1）
        const allStopped = selectedWells.every(w => w.status === 1);

        if (hasStarted) {
            showToast('包含已开井状态油井，请先恢复正常状态', 'danger');
            return;
        }
        if (allStopped) {
            showToast('全部油井已处于停井中状态', 'warning');
            return;
        }

        // 执行关井操作
        selectedRows.forEach(index => {
            if (wellData[index].status === 0) { // 仅修改正常状态井
                wellData[index].status = 1;
                wellData[index].stopTime = ''; // 清除原有时间
            }
        });
    }

    // 批量开井逻辑（状态2）
    if (newStatus === 2) {
        // 检查是否存在正常状态井
        const hasNormal = selectedWells.some(w => w.status === 0);
        // 检查是否全部为开井状态
        const allStarted = selectedWells.every(w => w.status === 2);
        // 检查是否混合正常和开井状态
        const mixedNormalStarted = selectedWells.some(w => w.status === 0) && 
                                  selectedWells.some(w => w.status === 2);

        if (hasNormal) {
            showToast('包含正常状态油井，请先设为停井状态', 'danger');
            return;
        }
        if (allStarted) {
            showToast('全部油井已处于开井状态', 'warning');
            return;
        }
        if (mixedNormalStarted) {
            showToast('不能混合正常和开井状态操作', 'danger');
            return;
        }

        // 执行开井操作
        selectedRows.forEach(index => {
            if (wellData[index].status === 1) { // 仅修改停井中状态井
                wellData[index].status = 2;
            }
        });
    }

    // 修改后的自动切换筛选状态逻辑
    const hasVisibleData = wellData.some(well => {
        if (well.isLongStop) return false; // 排除长停井
        
        let actualGroups = [currentGroupFilter];
        if (GROUP_MERGE_RULES[currentGroupFilter]) {
            actualGroups = GROUP_MERGE_RULES[currentGroupFilter];
        }
        
        const groupMatch = currentGroupFilter ? 
            actualGroups.includes(well.group) : true;
        const statusMatch = () => {
            if (!currentStatusFilter) return true;
            if (currentStatusFilter === 'long') return false;
            return well.status === parseInt(currentStatusFilter);
        };
        
        return groupMatch && statusMatch();
    });

    // 如果当前筛选条件下没有数据了，自动重置筛选
    if (!hasVisibleData && (currentGroupFilter || currentStatusFilter)) {
        currentGroupFilter = '';
        currentStatusFilter = '';
        document.getElementById('groupFilter').value = '';
        document.getElementById('statusFilter').value = '';
        handleFilterChange();
    } else {
        renderTable();
    }

    // 更新界面和数据（新增清除选中）
    selectedRows.clear(); // 确保操作后清除选中
    renderTable();
    saveData();
    updateStatistics();
    document.getElementById('selectAll').checked = false;
}
 
// 修改后的时间应用函数 
function applyBatchTime() {
    if (selectedRows.size === 0) {
        showToast('请勾选需要操作的油井', 'danger');
        return;
    }
    if (isHourMode) {
        const hours = document.getElementById('batchHours').value;
        if (!hours) {
            showToast('请输入影响小时数', 'warning');
            return;
        }
        selectedRows.forEach(index => {
            if (!wellData[index].isLongStop) {
                wellData[index].hours = parseFloat(hours);
            }
        });
        selectedRows.clear();
        renderTable();
        saveData();
        updateStatistics();
        document.getElementById('selectAll').checked = false;
        return;
    }
    // 原有逻辑
    let allNormal = true;
    selectedRows.forEach(index  => {
        if (wellData[index].status !== 0) {
            allNormal = false;
        }
    });
    if (allNormal) {
        showToast('所选油井状态正常，请切换状态后操作', 'warning');
        return;
    }
    const stopTime = document.getElementById('batchStopTime').value;
    const startTime = document.getElementById('batchStartTime').value;
    selectedRows.forEach(index => {
        const well = wellData[index];
        if (stopTime && (well.status === 1 || well.status === 2)) {
            well.stopTime = stopTime;
        }
        if (startTime && well.status === 2) {
            well.startTime = startTime;
        }
    });
    selectedRows.clear();
    renderTable();
    saveData();
    updateStatistics();
    document.getElementById('selectAll').checked  = false;
}

// 新增函数：获取井组状态
function getGroupStatus(groupWells) {
  const validWells = groupWells.filter(w  => !w.isLongStop); 
  if (validWells.length  === 0) return 0;
  
  const allStopped = validWells.every(w  => w.status  === 1);
  const allStarted = validWells.every(w  => w.status  === 2);
  
  if (allStopped) return 1;
  if (allStarted) return 2;
  return 0;
}

// 新增函数：处理井组状态切换
function toggleGroupStatus(groupName, currentStatus) {
  const newStatus = (currentStatus + 1) % 3;
  const statusTexts = ['恢复正常', '全部停井', '全部开井'];
  const actionTexts = ['正常', '停井中', '已开井'];

  if (!confirm(`确定要将【${groupName}】井组改为${statusTexts[newStatus]}状态吗？`)) return;

  wellData.forEach(well   => {
    if (well.group   === groupName && !well.isLongStop)   {
      well.status   = newStatus;
      // 切换组状态时清除停井时间
      well.stopTime = '';
      well.startTime = '';
      well.hours = undefined;
    }
  });

  renderTable();
  saveData();
}

function parseNumber(value) {
    const num = typeof value === 'string' 
        ? parseFloat(value.replace(/,/g,  '')) 
        : Number(value);
    return isNaN(num) ? 0 : num;
}

function getStatusClass(status, isLongStop) {
    if (isLongStop) return 'status-long-stop';
    return ['', 'status-stopped', 'status-started'][status] || '';
}

function getStatusText(status, isLongStop) {
    if (isLongStop) return '长停井'; // 修正状态显示
    return ['正常', '停井中', '已开井'][status] || '未知状态';
}

function updateGlobalStats() {
    document.getElementById('totalWells').textContent  = wellData.length; 
    document.getElementById('longStopWells').textContent  = 
        wellData.filter(w  => w.isLongStop).length; 
}

function updateStatistics() {
    if (isHourMode) {
        // 小时数模式下统计所有非长停井且hours有值的井
        const validWells = wellData.filter(w => !w.isLongStop && w.hours > 0);
        let affectedLiquid = 0, affectedOil = 0, affectedGas = 0;
        validWells.forEach(w => {
            const factor = w.hours / 24;
            affectedLiquid += w.liquid * factor;
            affectedOil += w.oil * factor;
            affectedGas += w.gas * factor;
        });
        document.getElementById('affectedLiquid').textContent = affectedLiquid.toFixed(1);
        document.getElementById('affectedOil').textContent = affectedOil.toFixed(1);
        document.getElementById('affectedGas').textContent = affectedGas.toFixed(0);
        // 其他统计区显示为0或-，避免误导
        document.getElementById('totalStoppedCard').textContent = '-';
        document.getElementById('noValveStopped').textContent = '-';
        document.getElementById('stoppedLiquid').textContent = '-';
        document.getElementById('stoppedOil').textContent = '-';
        document.getElementById('stoppedGas').textContent = '-';
        document.getElementById('totalStarted').textContent = '-';
        document.getElementById('totalNotStarted').textContent = '-';
        document.getElementById('notStartedLiquid').textContent = '-';
        document.getElementById('notStartedOil').textContent = '-';
        document.getElementById('notStartedGas').textContent = '-';
        return;
    }
    const stoppedWells = wellData.filter(w => (w.status === 1 || w.status === 2) && !w.isLongStop);   
    const startedWells = stoppedWells.filter(w => w.status === 2);
    const notStartedWells = stoppedWells.filter(w => w.status === 1);
    
    // 停井统计（包含单流阀状态变化触发）
	document.getElementById('totalStoppedCard').textContent  = stoppedWells.length;  
    const noValveStopped = stoppedWells.filter(w  => w.valve  === '否').length;
    document.getElementById('noValveStopped').textContent  = noValveStopped;
	
	// 新增停井日量计算
    document.getElementById('stoppedLiquid').textContent  = 
        stoppedWells.reduce((sum,  w) => sum + w.liquid,  0).toFixed(1);
    document.getElementById('stoppedOil').textContent  = 
        stoppedWells.reduce((sum,  w) => sum + w.oil,  0).toFixed(1);
    document.getElementById('stoppedGas').textContent  = 
        stoppedWells.reduce((sum,  w) => sum + w.gas,  0).toFixed(0);

    document.getElementById('totalStarted').textContent  = startedWells.length; 
    document.getElementById('totalNotStarted').textContent  = notStartedWells.length; 
    document.getElementById('notStartedLiquid').textContent  = 
        notStartedWells.reduce((sum,  w) => sum + w.liquid,  0).toFixed(1);
    document.getElementById('notStartedOil').textContent  = 
        notStartedWells.reduce((sum,  w) => sum + w.oil,  0).toFixed(1);
    document.getElementById('notStartedGas').textContent  = 
        notStartedWells.reduce((sum,  w) => sum + w.gas,  0).toFixed(0);

    // 产量影响计算优化
    let affectedLiquid = 0, affectedOil = 0, affectedGas = 0;
    wellData.forEach(w  => {
        if (w.status  !== 0) { // 只计算非正常状态
            const days = calculateTimeDiff(w.stopTime,  w.startTime);  
            affectedLiquid += w.liquid  * days;
            affectedOil += w.oil  * days;
            affectedGas += w.gas  * days;
        }
    });

    document.getElementById('affectedLiquid').textContent  = affectedLiquid.toFixed(1); 
    document.getElementById('affectedOil').textContent  = affectedOil.toFixed(1); 
    document.getElementById('affectedGas').textContent  = affectedGas.toFixed(0); 
}

function toggleStatus(index) {
    const well = wellData[index];
    if (well.isLongStop)  return;

    const newStatus = (well.status  + 1) % 3;
    // 已开井切回正常时确认
    if (well.status  === 2 && newStatus === 0) {
        if (!confirm('确定要恢复正常状态吗？')) return;
    }
    // 只有切回正常状态时才清空时间
    if (newStatus === 0) {
        well.stopTime = '';
        well.startTime = '';
        well.hours = undefined;
    }
    well.status  = newStatus;
    renderTable();
    saveData();
}

function updateValve(index, value) {
    wellData[index].valve = value;
    updateStatistics(); // 新增统计更新
    saveData();
}

function updateStopTime(index, value) {
    wellData[index].stopTime = value;
    updateStatistics(); // 新增统计更新
    saveData();
}

function updateStartTime(index, value) {
    wellData[index].startTime = value;
    updateStatistics(); // 新增统计更新
    saveData();
}

function exportData() {
  if (isHourMode) {
    // 小时数模式下只导出井组、井号、小时数、日产量、影响液量，表头全中文
    const headers = [
      "井组", "井号", "影响小时数", "日液量(t)", "日油量(t)", "日气量(m³)", "影响液量(t)", "影响油量(t)", "影响气量(m³)"
    ];
    const data = wellData.filter(w => !w.isLongStop && w.hours > 0).map(w => {
      const factor = w.hours / 24;
      return {
        "井组": w.group,
        "井号": w.number,
        "影响小时数": w.hours,
        "日液量(t)": w.liquid,
        "日油量(t)": w.oil,
        "日气量(m³)": w.gas,
        "影响液量(t)": (w.liquid * factor).toFixed(2),
        "影响油量(t)": (w.oil * factor).toFixed(2),
        "影响气量(m³)": (w.gas * factor).toFixed(0)
      };
    });
    // 统计总井数
    const totalWells = data.length;
    // 计算合计（只合计影响液量、影响油量、影响气量）
    let sumAffectedLiquid=0, sumAffectedOil=0, sumAffectedGas=0;
    data.forEach(row => {
      sumAffectedLiquid += Number(row["影响液量(t)"]);
      sumAffectedOil += Number(row["影响油量(t)"]);
      sumAffectedGas += Number(row["影响气量(m³)"]);
    });
    // 合计行，井号列显示总井数
    data.push({
      "井组": "合计",
      "井号": `总井数：${totalWells}`,
      "影响小时数": "",
      "日液量(t)": "",
      "日油量(t)": "",
      "日气量(m³)": "",
      "影响液量(t)": sumAffectedLiquid.toFixed(2),
      "影响油量(t)": sumAffectedOil.toFixed(2),
      "影响气量(m³)": sumAffectedGas.toFixed(0)
    });
    const ws = XLSX.utils.json_to_sheet(data, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "小时数影响数据");
    XLSX.writeFile(wb, "小时数影响数据.xlsx");
    return;
  }
  const chineseHeaders = {
    group: "井组",
    number: "井号",
    status: "状态",
    valve: "是否装阀",
    stopTime: "停井时间",
    startTime: "开井时间",
    liquid: "液量(t)",
    oil: "油量(t)",
    water: "水量(t)",
    gas: "气量(m³)",
    note: "备注",
  };

  // 修改后的数据转换逻辑
  const chineseData = wellData.map(well  => {
    const newWell = {};
    for (let key in well) {
      const chineseKey = chineseHeaders[key];
      if (!chineseKey) continue;

      // 特殊字段处理
      if (key === 'status') {
        newWell[chineseKey] = getStatusText(well[key], well.isLongStop); 
      } else {
        newWell[chineseKey] = well[key];
      }
    }
    return newWell;
  });

  // 保持原有列顺序
  const ws = XLSX.utils.json_to_sheet(chineseData,  {
    header: Object.values(chineseHeaders) 
  });

  const wb = XLSX.utils.book_new(); 
  XLSX.utils.book_append_sheet(wb,  ws, "停井数据汇总");
  XLSX.writeFile(wb,  "停井数据汇总.xlsx");
}

function generateSummary() {
    if (isHourMode) {
        const validWells = wellData.filter(w => !w.isLongStop && w.hours > 0);
        let affectedLiquid = 0, affectedOil = 0, affectedGas = 0;
        let rows = '';
        validWells.forEach(w => {
            const factor = w.hours / 24;
            const l = w.liquid * factor;
            const o = w.oil * factor;
            const g = w.gas * factor;
            affectedLiquid += l;
            affectedOil += o;
            affectedGas += g;
            rows += `<tr><td>${w.group}</td><td>${w.number}</td><td>${w.hours}</td><td>${w.liquid}</td><td>${w.oil}</td><td>${w.gas}</td><td>${l.toFixed(2)}</td><td>${o.toFixed(2)}</td><td>${g.toFixed(0)}</td></tr>`;
        });
        // 合计行，井号列显示总井数
        const totalWells = validWells.length;
        const sumRow = `<tr style='font-weight:bold;background:#f8f9fa;'><td>合计</td><td>总井数：${totalWells}</td><td></td><td></td><td></td><td></td><td>${affectedLiquid.toFixed(2)}</td><td>${affectedOil.toFixed(2)}</td><td>${affectedGas.toFixed(0)}</td></tr>`;
        const content = document.getElementById('printContent');
        content.innerHTML = `
        <div style='overflow:auto;max-height:600px;'>
        <table class="table table-bordered" style="min-width:900px;">
            <thead style='position:sticky;top:0;z-index:10;background:#fff;'>
                <tr><th>井组</th><th>井号</th><th>影响小时数</th><th>日液量(t)</th><th>日油量(t)</th><th>日气量(m³)</th><th>影响液量(t)</th><th>影响油量(t)</th><th>影响气量(m³)</th></tr>
            </thead>
            <tbody>${rows}${sumRow}</tbody>
        </table>
        </div>`;
        // 弹出模态框
        const modal = new bootstrap.Modal(document.getElementById('printModal'));
        modal.show();
        return;
    }
    const now = new Date().toLocaleString('zh-CN', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

    // 新增变频井过滤函数（修改判断条件）
    const filterFrequencyWells = wells => 
        wells.filter(w => w.note.includes('频率'));

    const stoppedWells = wellData.filter(w => (w.status === 1 || w.status === 2) && !w.isLongStop);   
    const startedWells = stoppedWells.filter(w => w.status === 2);
    const notStartedWells = stoppedWells.filter(w => w.status === 1);

    // 计算各分类变频井数量
    const stoppedFrequencyCount = filterFrequencyWells(stoppedWells).length;
    const startedFrequencyCount = filterFrequencyWells(startedWells).length;
    const notStartedFrequencyCount = filterFrequencyWells(notStartedWells).length;

    // 新增：按开井时间分组
    const wellsByStartTime = {};
    startedWells.forEach(well => {
        const startTime = well.startTime || '未设置';
        if (!wellsByStartTime[startTime]) {
            wellsByStartTime[startTime] = [];
        }
        wellsByStartTime[startTime].push(well);
    });

    const content = document.getElementById('printContent');  
    content.innerHTML = `
        <style>
            /* 新增样式 */
            .frequency-count {
                font-size: 1em;
                color: #6c757d;
                margin-left: 10px;
            }
	
            /* 新增变频井样式 */
            .variable-frequency {
                margin-top: 8px;
                padding: 8px;
                background: #f8f9fa;
                border-radius: 4px;
            }
            .variable-frequency-title {
                font-weight: 500;
                color: #2c3e50;
                margin-bottom: 4px;
            }

            .summary-table {
                width: 100%;
                table-layout: fixed;
                margin: 5px 0;
                border: 1px solid #ddd;
                border-radius: 4px;
                overflow: hidden;
                box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .well-numbers {
                display: flex;
                flex-wrap: wrap;
                gap: 8px 12px;
                padding: 5px;
                border: 1px solid #eee;
                border-radius: 3px;
                margin: 5px 0;
            }
            .well-number {
                background: #f8f9fa;
                padding: 2px 6px;
                border-radius: 3px;
                border: 1px solid #dee2e6;
            }
            .summary-table th {
                background: #f8f9fa;
                padding: 8px!important;
                border-bottom: 2px solid #dee2e6;
            }
            .summary-table td {
                padding: 8px!important;
                vertical-align: top;
            }
            .print-title {
                font-size: 18px;
                font-weight: bold;
                color: #2c3e50;
                text-align: center;
                padding-bottom: 8px;
                border-bottom: 2px solid #2c3e50;
                margin-bottom: 12px;
            }
            .stats-row {
                background: #f8f9fa;
                padding: 8px;
                border-radius: 4px;
                margin: 8px 0;
            }
            .summary-table td {
                line-height: 1.3 !important;  /* 减小行高 */
                padding: 4px 6px !important;  /* 减小单元格内边距 */
            }
            /* 批次详情样式 */
            .batch-details {
                margin-top: 20px;
                display: none;
            }
            .batch-title {
                font-weight: bold;
                font-size: 16px;
                margin: 15px 0 5px 0;
                color: #2c3e50;
            }
            .btn-details {
                color: #007bff;
                border-color: #007bff;
                background-color: transparent;
                font-size: 0.9em;
                padding: 2px 8px;
                margin-left: 10px;
                cursor: pointer;
            }
            /* 新增复制按钮样式 */
            .btn-copy {
                color: #007bff;
                border-color: #007bff;
                background-color: transparent;
                font-size: 0.9em;
                padding: 2px 8px;
                cursor: pointer;
            }
            /* 新增批次容器样式 */
            .batch-container {
                background-color: #f8f9fa;
                border: 1px solid #e9ecef;
                border-radius: 6px;
                padding: 15px;
                margin-bottom: 15px;
            }
            .batch-item {
                border-bottom: 1px dashed #dee2e6;
                padding-bottom: 15px;
                margin-bottom: 15px;
            }
            .batch-item:last-child {
                border-bottom: none;
                margin-bottom: 0;
                padding-bottom: 0;
            }
            .batch-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            .details-title {
                background-color: #e9ecef;
                padding: 8px 15px;
                border-radius: 4px;
                font-weight: 500;
                color: #495057;
                margin-bottom: 15px;
            }
        </style>

        <div class="print-title">停井数据汇总表</div>
        <div class="text-end" style="margin-bottom:15px; color:#6c757d;">生成时间：${now}</div>

        <!-- 停井数据汇总 -->
        <table class="summary-table">
            <thead>
                <tr><th colspan="2">
                    <div class="d-flex align-items-center justify-content-between">
                        <div class="d-flex align-items-center">
                            <span>停井数据汇总（共${stoppedWells.length}口
                            <span class="frequency-count">其中变频井${stoppedFrequencyCount}口</span>）</span>
                            <span style="white-space:nowrap; margin-left:10px; margin-right:5px;">停井时间：</span>
                            <input type="time" class="form-control form-control-sm" id="stoppedTimeInput" placeholder="请填写停井时间" style="width:140px;">
                        </div>
                        <button class="btn btn-sm btn-copy" id="copyStoppedBtn">
                            复制
                        </button>
                    </div>
                </th></tr>
            </thead>
            <tbody>
                <tr>
                    <td colspan="2">
                        <div style="font-weight:500; color:#2c3e50;">停井井号：</div>
                        <div>${stoppedWells.map(w => w.number).join('、')}</div>
                        
                        <!-- 变频井单独列出 -->
                        <div class="variable-frequency">
                            <div class="variable-frequency-title">变频井号：</div>
                            <div>${filterFrequencyWells(stoppedWells).map(w => w.number).join('、') || '无'}</div>
                        </div>
                        
                        <div class="stats-row">
                            <span>日液能力：</span>
                            <span>日液${stoppedWells.reduce((s,w)  => s + w.liquid,  0).toFixed(1)}t，日油${stoppedWells.reduce((s,w)  => s + w.oil,  0).toFixed(1)}t，日气${stoppedWells.reduce((s,w)  => s + w.gas,  0).toFixed(0)}m³</span>
                        </div>
                        
                        <div class="stats-row d-flex justify-content-between align-items-center">
                            <div>
                                <span>累计影响：</span>
                                <span>液量${document.getElementById('affectedLiquid').textContent}t，油量${document.getElementById('affectedOil').textContent}t，气量${document.getElementById('affectedGas').textContent}m³</span>
                                <button class="btn btn-sm btn-details" id="btnShowDetails">详情</button>
                                <button class="btn btn-sm btn-copy" id="copyBatchDetailsBtn">复制详情</button>
                            </div>
                        </div>
                        
                        <!-- 新增：批次详情区域 -->
                        <div id="batchDetails" class="batch-details">
                            <div class="details-title">按开井时间分批次显示</div>
                            <div class="batch-container">
                                ${Object.entries(wellsByStartTime).map(([startTime, wells], index) => {
                                    const batchFrequencyCount = filterFrequencyWells(wells).length;
                                    const batchLiquid = wells.reduce((s,w) => s + w.liquid, 0).toFixed(1);
                                    const batchOil = wells.reduce((s,w) => s + w.oil, 0).toFixed(1);
                                    const batchGas = wells.reduce((s,w) => s + w.gas, 0).toFixed(0);
                                    
                                    // 计算此批次的累计影响
                                    let batchAffectedLiquid = 0, batchAffectedOil = 0, batchAffectedGas = 0;
                                    wells.forEach(w => {
                                        const days = calculateTimeDiff(w.stopTime, w.startTime);
                                        batchAffectedLiquid += w.liquid * days;
                                        batchAffectedOil += w.oil * days;
                                        batchAffectedGas += w.gas * days;
                                    });
                                    
                                    return `
                                    <div class="batch-item">
                                        <div class="batch-header">
                                            <div class="batch-title">第${index+1}批开井，开井时间：${startTime}</div>
                                            <button class="btn btn-sm btn-copy batch-copy-btn" data-batch-index="${index}">复制此批</button>
                                        </div>
                                        <div>停井数据汇总（共${wells.length}口 其中变频井${batchFrequencyCount}口）</div>
                                        <div style="font-weight:500; margin-top:5px;">开井井号：</div>
                                        <div>${wells.map(w => w.number).join('、')}</div>
                                        
                                        <div style="font-weight:500; margin-top:5px;">变频井号：</div>
                                        <div>${filterFrequencyWells(wells).map(w => w.number).join('、') || '无'}</div>
                                        
                                        <div class="stats-row">
                                            <span>日液能力：</span>
                                            <span>日液${batchLiquid}t，日油${batchOil}t，日气${batchGas}m³</span>
                                        </div>
                                        
                                        <div class="stats-row">
                                            <span>累计影响：</span>
                                            <span>液量${batchAffectedLiquid.toFixed(1)}t，油量${batchAffectedOil.toFixed(1)}t，气量${batchAffectedGas.toFixed(0)}m³</span>
                                        </div>
                                    </div>
                                    `;
                                }).join('')}
                                <div class="batch-item" id="notStartedBatch">
                                    <div class="batch-header">
                                        <div class="batch-title">未开井</div>
                                        <button class="btn btn-sm btn-copy" id="copyNotStartedBatchBtn">复制此批</button>
                                    </div>
                                    <div>停井数据汇总（共${notStartedWells.length}口 其中变频井${notStartedFrequencyCount}口）</div>
                                    <div style="font-weight:500; margin-top:5px;">开井井号：</div>
                                    <div>${notStartedWells.map(w => w.number).join('、')}</div>
                                    
                                    <div style="font-weight:500; margin-top:5px;">变频井号：</div>
                                    <div>${filterFrequencyWells(notStartedWells).map(w => w.number).join('、') || '无'}</div>
                                    
                                    <div class="stats-row">
                                        <span>日液能力：</span>
                                        <span>日液${notStartedWells.reduce((s,w) => s + w.liquid, 0).toFixed(1)}t，日油${notStartedWells.reduce((s,w) => s + w.oil, 0).toFixed(1)}t，日气${notStartedWells.reduce((s,w) => s + w.gas, 0).toFixed(0)}m³</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>

        <!-- 开井数据汇总 -->
        <table class="summary-table">
            <thead>
                <tr><th colspan="2">
                    开井数据汇总（共${startedWells.length}口
                    <span class="frequency-count">其中变频井${startedFrequencyCount}口</span>）
                    <button class="btn btn-sm btn-copy float-end" id="copyStartedBtn">
                        复制
                    </button>
                </th></tr>
            </thead>
            <tbody>
                <tr>
                    <td colspan="2">
                        <div style="font-weight:500; color:#2c3e50;">开井井号：</div>
                        <div>${startedWells.map(w => w.number).join('、')}</div>
                        
                        <div class="variable-frequency">
                            <div class="variable-frequency-title">变频井号：</div>
                            <div>${filterFrequencyWells(startedWells).map(w => w.number).join('、') || '无'}</div>
                        </div>
                        
                        <div class="stats-row">
                            <span>日液能力：</span>
                            <span>日液${startedWells.reduce((s,w)  => s + w.liquid,  0).toFixed(1)}t，日油${startedWells.reduce((s,w)  => s + w.oil,  0).toFixed(1)}t，日气${startedWells.reduce((s,w)  => s + w.gas,  0).toFixed(0)}m³</span>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>

        <!-- 未开井数据汇总 -->
        <table class="summary-table">
            <thead>
                <tr><th colspan="2">
                    未开井数据汇总（共${notStartedWells.length}口
                    <span class="frequency-count">其中变频井${notStartedFrequencyCount}口</span>）
                    <button class="btn btn-sm btn-copy float-end" id="copyNotStartedBtn">
                        复制
                    </button>
                </th></tr>
            </thead>
            <tbody>
                <tr>
                    <td colspan="2">
                        <div style="font-weight:500; color:#2c3e50;">未开井号：</div>
                        <div>${notStartedWells.map(w => w.number).join('、')}</div>
                        
                        <!-- 新增变频井统计 -->
                        <div class="variable-frequency">
                            <div class="variable-frequency-title">变频井号：</div>
                            <div>${filterFrequencyWells(notStartedWells).map(w => w.number).join('、') || '无'}</div>
                        </div>
                        
                        <div class="stats-row">
                            <span>日液能力：</span>
                            <span>日液${notStartedWells.reduce((s,w)  => s + w.liquid,  0).toFixed(1)}t，日油${notStartedWells.reduce((s,w)  => s + w.oil,  0).toFixed(1)}t，日气${notStartedWells.reduce((s,w)  => s + w.gas,  0).toFixed(0)}m³</span>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
    `;

    // 移除原有打印按钮
    document.querySelector('#printModal .modal-footer').innerHTML = '';
    
    new bootstrap.Modal(document.getElementById('printModal')).show();

    // 绑定复制按钮事件
    setTimeout(() => {
        // 新增详情按钮点击事件
        document.getElementById('btnShowDetails').addEventListener('click', function() {
            const detailsArea = document.getElementById('batchDetails');
            if (detailsArea.style.display === 'block') {
                detailsArea.style.display = 'none';
                this.textContent = '详情';
            } else {
                detailsArea.style.display = 'block';
                this.textContent = '收起';
            }
        });
        
        document.getElementById('copyStoppedBtn').onclick = () => {
            const stoppedTime = document.getElementById('stoppedTimeInput').value || '';
            const stoppedText = `停井数据汇总（共${stoppedWells.length}口 其中变频井${stoppedFrequencyCount}口）${stoppedTime ? ' 停井时间：' + stoppedTime : ''}
停井井号：
${stoppedWells.map(w => w.number).join('、')}
变频井号：
${filterFrequencyWells(stoppedWells).map(w => w.number).join('、') || '无'}
日液能力： 日液${stoppedWells.reduce((s,w) => s + w.liquid, 0).toFixed(1)}t，日油${stoppedWells.reduce((s,w) => s + w.oil, 0).toFixed(1)}t，日气${stoppedWells.reduce((s,w) => s + w.gas, 0).toFixed(0)}m³
累计影响： 液量${document.getElementById('affectedLiquid').textContent}t，油量${document.getElementById('affectedOil').textContent}t，气量${document.getElementById('affectedGas').textContent}m³`;
            copyText(stoppedText);
        };
        
        document.getElementById('copyStartedBtn').onclick = () => {
            const startedText = `开井数据汇总（共${startedWells.length}口 其中变频井${startedFrequencyCount}口）
开井井号：
${startedWells.map(w => w.number).join('、')}
变频井号：
${filterFrequencyWells(startedWells).map(w => w.number).join('、') || '无'}
日液能力： 日液${startedWells.reduce((s,w) => s + w.liquid, 0).toFixed(1)}t，日油${startedWells.reduce((s,w) => s + w.oil, 0).toFixed(1)}t，日气${startedWells.reduce((s,w) => s + w.gas, 0).toFixed(0)}m³`;
            copyText(startedText);
        };
        
        document.getElementById('copyNotStartedBtn').onclick = () => {
            const notStartedText = `未开井数据汇总（共${notStartedWells.length}口 其中变频井${notStartedFrequencyCount}口）
未开井号：
${notStartedWells.map(w => w.number).join('、')}
变频井号：
${filterFrequencyWells(notStartedWells).map(w => w.number).join('、') || '无'}
日液能力： 日液${notStartedWells.reduce((s,w) => s + w.liquid, 0).toFixed(1)}t，日油${notStartedWells.reduce((s,w) => s + w.oil, 0).toFixed(1)}t，日气${notStartedWells.reduce((s,w) => s + w.gas, 0).toFixed(0)}m³`;
            copyText(notStartedText);
        };
        
        // 新增：复制批次详情按钮
        document.getElementById('copyBatchDetailsBtn').onclick = () => {
            // 生成批次详情文本
            let batchDetailsText = '';
            
            Object.entries(wellsByStartTime).forEach(([startTime, wells], index) => {
                const batchFrequencyCount = filterFrequencyWells(wells).length;
                const batchLiquid = wells.reduce((s,w) => s + w.liquid, 0).toFixed(1);
                const batchOil = wells.reduce((s,w) => s + w.oil, 0).toFixed(1);
                const batchGas = wells.reduce((s,w) => s + w.gas, 0).toFixed(0);
                
                // 计算此批次的累计影响
                let batchAffectedLiquid = 0, batchAffectedOil = 0, batchAffectedGas = 0;
                wells.forEach(w => {
                    const days = calculateTimeDiff(w.stopTime, w.startTime);
                    batchAffectedLiquid += w.liquid * days;
                    batchAffectedOil += w.oil * days;
                    batchAffectedGas += w.gas * days;
                });
                
                batchDetailsText += `第${index+1}批开井，开井时间：${startTime}
停井数据汇总（共${wells.length}口 其中变频井${batchFrequencyCount}口）
停井井号：
${wells.map(w => w.number).join('、')}
变频井号：
${filterFrequencyWells(wells).map(w => w.number).join('、') || '无'}
日液能力： 日液${batchLiquid}t，日油${batchOil}t，日气${batchGas}m³
累计影响： 液量${batchAffectedLiquid.toFixed(1)}t，油量${batchAffectedOil.toFixed(1)}t，气量${batchAffectedGas.toFixed(0)}m³\n\n`;
            });
            
            if (notStartedWells.length > 0) {
                batchDetailsText += `未开井
停井数据汇总（共${notStartedWells.length}口 其中变频井${notStartedFrequencyCount}口）
停井井号：
${notStartedWells.map(w => w.number).join('、')}
变频井号：
${filterFrequencyWells(notStartedWells).map(w => w.number).join('、') || '无'}
日液能力： 日液${notStartedWells.reduce((s,w) => s + w.liquid, 0).toFixed(1)}t，日油${notStartedWells.reduce((s,w) => s + w.oil, 0).toFixed(1)}t，日气${notStartedWells.reduce((s,w) => s + w.gas, 0).toFixed(0)}m³`;
            }
            
            copyText(batchDetailsText);
        };
        
        // 新增：各批次的复制按钮事件
        document.querySelectorAll('.batch-copy-btn').forEach((btn, index) => {
            btn.addEventListener('click', () => {
                const batchIndex = parseInt(btn.getAttribute('data-batch-index'));
                const entries = Object.entries(wellsByStartTime);
                if (batchIndex >= 0 && batchIndex < entries.length) {
                    const [startTime, wells] = entries[batchIndex];
                    const batchFrequencyCount = filterFrequencyWells(wells).length;
                    const batchLiquid = wells.reduce((s,w) => s + w.liquid, 0).toFixed(1);
                    const batchOil = wells.reduce((s,w) => s + w.oil, 0).toFixed(1);
                    const batchGas = wells.reduce((s,w) => s + w.gas, 0).toFixed(0);
                    
                    // 计算此批次的累计影响
                    let batchAffectedLiquid = 0, batchAffectedOil = 0, batchAffectedGas = 0;
                    wells.forEach(w => {
                        const days = calculateTimeDiff(w.stopTime, w.startTime);
                        batchAffectedLiquid += w.liquid * days;
                        batchAffectedOil += w.oil * days;
                        batchAffectedGas += w.gas * days;
                    });
                    
                    const batchText = `第${batchIndex+1}批开井，开井时间：${startTime}
停井数据汇总（共${wells.length}口 其中变频井${batchFrequencyCount}口）
开井井号：
${wells.map(w => w.number).join('、')}
变频井号：
${filterFrequencyWells(wells).map(w => w.number).join('、') || '无'}
日液能力： 日液${batchLiquid}t，日油${batchOil}t，日气${batchGas}m³
累计影响： 液量${batchAffectedLiquid.toFixed(1)}t，油量${batchAffectedOil.toFixed(1)}t，气量${batchAffectedGas.toFixed(0)}m³`;
                    
                    copyText(batchText);
                }
            });
        });
        
        // 未开井批次的复制按钮事件
        document.getElementById('copyNotStartedBatchBtn').addEventListener('click', () => {
            const notStartedText = `未开井
停井数据汇总（共${notStartedWells.length}口 其中变频井${notStartedFrequencyCount}口）
开井井号：
${notStartedWells.map(w => w.number).join('、')}
变频井号：
${filterFrequencyWells(notStartedWells).map(w => w.number).join('、') || '无'}
日液能力： 日液${notStartedWells.reduce((s,w) => s + w.liquid, 0).toFixed(1)}t，日油${notStartedWells.reduce((s,w) => s + w.oil, 0).toFixed(1)}t，日气${notStartedWells.reduce((s,w) => s + w.gas, 0).toFixed(0)}m³`;
            
            copyText(notStartedText);
        });
    }, 500);
}


function checkDataExpiry() {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; 
    
    if (!currentReportDate) return;
 
    try {
        const reportDate = new Date(currentReportDate);
        const timeDiff = today - reportDate;
        // 直接计算日期差值（当前日期 - 报表日期）
        const daysDiff = Math.floor(timeDiff  / (1000 * 3600 * 24)); 
 
        if (daysDiff > DATA_EXPIRY_DAYS && localStorage.getItem('lastAlertDate')  !== todayStr) {
            // 显示实际经过天数（原超期天数计算已移除）
            if (confirm(`油井数据已持续${daysDiff}天未更新（报表日期：${currentReportDate}），请立即处理！`)) {
                document.getElementById('excelFile').click(); 
            }
            localStorage.setItem('lastAlertDate',  todayStr);
        }
    } catch (e) {
        console.error(' 日期计算错误:', e);
    }
}

function clearData() {
    if (confirm('确定要重置所有操作数据吗？')) {
        wellData.forEach(w => {
            w.status = 0;
            w.stopTime = '';
            w.startTime = '';
            w.hours = undefined; // 小时数模式下也要清空hours
        });
        currentGroupFilter = '';
        currentStatusFilter = '';
        document.getElementById('groupFilter').value = '';
        document.getElementById('statusFilter').value = '';
        selectedRows.clear(); // 确保清除选中
        handleFilterChange();
        saveData();
    }
}

// 修改后的clearAllData函数
function clearAllData() {
    if (confirm('确定要清除所有数据吗？该操作不可撤销！')) {
        wellData = [];
        localStorage.removeItem('wellData');   
        localStorage.removeItem('reportDate');
        currentReportDate = null;
        document.getElementById('excelFile').value = '';
        currentGroupFilter = '';
        currentStatusFilter = '';
        document.getElementById('groupFilter').value = '';
        document.getElementById('statusFilter').value = '';
        const dateDisplay = document.getElementById('dataDateDisplay'); 
        dateDisplay.textContent = '数据日期：未导入';
        dateDisplay.style.color = 'red';
        selectedRows.clear(); // 确保清除选中
        handleFilterChange();
        updateStatistics();
        updateGlobalStats();
    }
}

// 添加复制功能
function copyText(text) {
    navigator.clipboard.writeText(text)
        .then(() => {
            showToast('已复制到剪贴板', 'success');
        })
        .catch(err => {
            showToast('复制失败', 'danger');
            console.error('复制出错:', err);
        });
}

function toggleStatMode() {
    isHourMode = !isHourMode;
    localStorage.setItem('isHourMode', isHourMode);
    // 切换模式时清除所有停井时间
    wellData.forEach(w => {
        w.stopTime = '';
        w.startTime = '';
        w.hours = undefined;
    });
    const btn = document.getElementById('toggleModeBtn');
    if (btn) {
        btn.textContent = isHourMode ? '切换为常规统计' : '切换为小时数统计';
    }
    renderTable();
    renderBatchTimeInput();
    updateStatistics();
    saveData();
}

// 页面初始化时同步按钮文字
window.addEventListener('DOMContentLoaded', function() {
    isHourMode = localStorage.getItem('isHourMode') === 'true';
    const btn = document.getElementById('toggleModeBtn');
    if (btn) {
        btn.textContent = isHourMode ? '切换为常规统计' : '切换为小时数统计';
    }
    renderBatchTimeInput();
});

// 小时数输入更新
function updateHours(index, value) {
  wellData[index].hours = value === '' ? undefined : parseFloat(value);
  updateStatistics();
  saveData();
}

function renderBatchTimeInput() {
    const stopTimeDiv = document.getElementById('batchStopTime').parentNode.parentNode;
    const startTimeDiv = document.getElementById('batchStartTime').parentNode.parentNode;
    let hourDiv = document.getElementById('batchHourDiv');
    if (!hourDiv) {
        hourDiv = document.createElement('div');
        hourDiv.className = 'col-auto';
        hourDiv.id = 'batchHourDiv';
        hourDiv.innerHTML = `<div class="input-group input-group-sm">
            <span class="input-group-text">影响小时数</span>
            <input type="number" min="0" step="0.01" class="form-control" id="batchHours">
        </div>`;
        startTimeDiv.parentNode.insertBefore(hourDiv, startTimeDiv.nextSibling);
    }
    if (isHourMode) {
        stopTimeDiv.style.display = 'none';
        startTimeDiv.style.display = 'none';
        hourDiv.style.display = '';
    } else {
        stopTimeDiv.style.display = '';
        startTimeDiv.style.display = '';
        hourDiv.style.display = 'none';
    }
}

// 重置筛选栏按钮事件
if (document.getElementById('resetFilterBtn')) {
    document.getElementById('resetFilterBtn').addEventListener('click', function() {
        // 重置下拉框
        document.getElementById('groupFilter').value = '';
        document.getElementById('statusFilter').value = '';
        // 重置时间输入框
        var stopTimeInput = document.getElementById('batchStopTime');
        var startTimeInput = document.getElementById('batchStartTime');
        var hoursInput = document.getElementById('batchHours');
        if (stopTimeInput) stopTimeInput.value = '';
        if (startTimeInput) startTimeInput.value = '';
        if (hoursInput) hoursInput.value = '';
        // 只刷新筛选，不影响表格数据
        currentGroupFilter = '';
        currentStatusFilter = '';
        handleFilterChange();
    });
}