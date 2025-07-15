const APP_VERSION = "0.2.17"; 
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

const BRANCH_CONFIG = [
    { name: 'CB4E支线', groups: ['CB4EA','CB4EB','CBGX605', 'CB243A','CB246A','SHG1','SH201A','SH201B','CB246','CB4A','CB4B','CB4C','CB4DA','CB4DB','CB208A','CB208B','CB248A'] },
    { name: 'CB1F支线', groups: ['CB1FA','CB1FB','CB1FC','CB1A','CB1D','CB1B','CB1HA','CB1HB','CB6B','CB6E','CB6FA','CB6FB','CBX212','CB6GA','CB6GB','CB6A','CB6C','CB6D'] },
    { name: 'CB22F支线', groups: ['CB22FA','CB22FB','CB22FC','CB25B','CB22B','CB22D'] },
    { name: 'CB26支线', groups: ['CB26A','CB26B'] },
    { name: '其他未选择支线的井组', groups: [] }
];
let branches = [];
let allGroups = new Set();
let placeholder = null;
let currentContainer = null;

const STORAGE_KEY = 'wellBranchData';

function init() {
    const savedData = localStorage.getItem('wellData'); 
    if (!savedData) {
        alert('请先导入数据');
        window.close(); 
        return;
    }
    
    // 优先读取保存的分支配置
    const savedBranch = localStorage.getItem(STORAGE_KEY); 
    if (savedBranch) {
        branches = JSON.parse(savedBranch); 
    } else {
        processWellData(JSON.parse(savedData)); 
    }
    
    renderBranchStats();
    renderGroupStats();
	
  // 添加井组点击事件
  document.querySelectorAll('.draggable-group').forEach(group => {
    group.addEventListener('dblclick', showGroupDetail);
  });
}


// 修改原始processWellData函数以兼容恢复
function processWellData(wellData) {
  const mergedGroups = new Map();
  Object.entries(GROUP_MERGE_RULES).forEach(([merged, subs]) => {
    subs.forEach(sub => mergedGroups.set(sub, merged));
  });

  // 创建虚拟合并数据
  const virtualData = wellData.map(well => ({
    ...well,
    virtualGroup: mergedGroups.get(well.group) || well.group
  }));

  // 统计各支线实际包含的井组
  branches = BRANCH_CONFIG.map(config => {
    const actualGroups = new Set();
    const branchGroups = new Set(config.groups);
    
    // 匹配原始和合并井组
    virtualData.forEach(well => {
      if (branchGroups.has(well.group) || branchGroups.has(well.virtualGroup)) {
        actualGroups.add(well.virtualGroup);
      }
    });

    return {
      ...config,
      groups: Array.from(actualGroups),
      liquid: virtualData
        .filter(w => actualGroups.has(w.virtualGroup))
        .reduce((sum, w) => sum + w.liquid, 0),
      oil: virtualData
        .filter(w => actualGroups.has(w.virtualGroup))
        .reduce((sum, w) => sum + w.oil, 0)
    };
  });
}

    // 新增统计计算
    const wellData = JSON.parse(localStorage.getItem('wellData'))  || [];
    const totalLiquid = wellData.reduce((sum,  w) => sum + w.liquid,  0);
    const totalOil = wellData.reduce((sum,  w) => sum + w.oil,  0);
    
    document.getElementById('totalLiquid').textContent  = totalLiquid.toFixed(1); 
    document.getElementById('totalOil').textContent  = totalOil.toFixed(1); 
    document.getElementById('totalWells').textContent  = wellData.length; 

// 新增井组井数统计函数 
function getGroupWellCount(groupName) {
  const savedData = JSON.parse(localStorage.getItem('wellData'))  || [];
  const subgroups = GROUP_MERGE_RULES[groupName] || [groupName];
  return subgroups.reduce((sum,  g) => 
    sum + savedData.filter(w  => w.group  === g).length 
  , 0);
}

// 新增井组详情函数
function showGroupDetail(event) {
  const groupName = event.target.textContent.trim();
  const actualGroups = GROUP_MERGE_RULES[groupName] || [groupName];
  
  const wellData = JSON.parse(localStorage.getItem('wellData')) || [];
  const groupWells = wellData.filter(w => 
    actualGroups.includes(w.group) || 
    GROUP_MERGE_RULES[w.group]?.includes(groupName)
  );
  
  // 获取井组数据
  const total = groupWells.length; 
  const longStop = groupWells.filter(w  => w.isLongStop).length; 
  const started = total - longStop; // 直接计算开井数
  
// 修改支线归属判断逻辑
  let belongBranch = '未分配';
  const checkGroups = GROUP_MERGE_RULES[groupName] || [groupName]; // 获取实际需要检查的井组
  
  // 遍历所有支线配置
  for (const branch of BRANCH_CONFIG) {
    // 检查支线是否包含任意一个关联井组
    if (checkGroups.some(g  => branch.groups.includes(g)))  {
      belongBranch = branch.name; 
      break;
    }
  }
  
  // 更新统计显示
  document.getElementById('detailBranch').textContent  = belongBranch;
  document.getElementById('detailTotal').textContent  = total;
  document.getElementById('detailStarted').textContent  = started;
  document.getElementById('detailLongStop').textContent  = longStop;
  
  // 生成明细表格
  const tbody = document.getElementById('detailBody'); 
  const totalLiquid = groupWells.reduce((sum,  w) => sum + w.liquid,  0);
  const totalOil = groupWells.reduce((sum,  w) => sum + w.oil,  0);
  const totalGas = groupWells.reduce((sum,  w) => sum + w.gas,  0);

  tbody.innerHTML  = groupWells.map((well,  index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${well.number}</td>  
      <td>${well.liquid.toFixed(1)}</td> 
      <td>${well.oil.toFixed(1)}</td> 
      <td>${well.gas.toFixed(0)}</td> 
      <td>${well.isLongStop  ? '长停井' : ''}</td>
    </tr>
  `).join('') + `
    <tr style="background-color: #f8f9fa;">
      <td colspan="2" class="text-center"><strong>合计</strong></td>
      <td>${totalLiquid.toFixed(1)}</td> 
      <td>${totalOil.toFixed(1)}</td> 
      <td>${totalGas.toFixed(0)}</td> 
      <td></td>
    </tr>
  `;
  
  // 显示模态框
  new bootstrap.Modal(document.getElementById('groupDetailModal')).show(); 
}

// 从主应用复制状态文本函数
function getStatusText(status, isLongStop) {
  if (isLongStop) return '长停井';
  return ['正常', '停井中', '已开井'][status] || '未知状态';
}

function renderBranchStats() {
  function renderBranch(branch, containerId) {
    const container = document.getElementById(containerId);  
    const titleElement = container.previousElementSibling;  
    
    titleElement.innerHTML = `
        <div class="branch-name">${branch.name}</div> 
        <div class="branch-stats">
            <span>液量: <span class="stat-value">${branch.liquid.toFixed(1)}</span>t</span> 
            <span>油量: <span class="stat-value">${branch.oil.toFixed(1)}</span>t</span> 
        </div>
        <div class="drag-hint">拖动井组调整分配</div>
    `;
 
    container.innerHTML = branch.groups.map(group => `
      <div class="draggable-group" 
           draggable="true"
           ondragstart="dragGroup(event, '${group}', '${branch.name}')">  
        ${group}
      </div>
    `).join('');
  }
 
  renderBranch(branches[0], 'branchCB4E');
  renderBranch(branches[1], 'branchCB1F');
  renderBranch(branches[2], 'branchCB22F');
  renderBranch(branches[3], 'branchCB26');
    
  const otherBranch = branches[4];
  const otherContainer = document.getElementById('branchOther'); 
  otherContainer.parentNode.querySelector('.branch-title').innerHTML = `
      ${otherBranch.name} 
      <div class="stats">
          液量: ${otherBranch.liquid.toFixed(1)}t<br> 
          油量: ${otherBranch.oil.toFixed(1)}t 
      </div>
      <div class="drag-hint">拖动井组调整分配</div>
  `;
  otherContainer.innerHTML = otherBranch.groups.map(group => `
      <div class="draggable-group" 
           draggable="true"
           ondragstart="dragGroup(event, '${group}', '其他未选择支线的井组')">
          ${group}
      </div>
  `).join('');

  // 新增事件绑定
  document.querySelectorAll('.draggable-group').forEach(group => {
    group.addEventListener('dblclick', showGroupDetail);
  });
}

function renderGroupStats() {
    const container = document.getElementById('groupStatsBody');
    let html = '';
      branches.forEach(branch  => {
    // 计算支线总井数 
    const totalWells = branch.groups.reduce((sum,  g) => 
      sum + getGroupWellCount(g), 0);
        html += `
            <div style="flex: 1 1 500px;"> <!-- 新增弹性容器 -->
                <table class="excel-table">
                <tr>
                    <th>${branch.name}</th>
                    <th>总计</th>
            ${branch.groups.map(g  => `<th>${g}</th>`).join('')}
                </tr>
                <tr>
                    <td>液量 (t)</td>
                    <td>${branch.liquid.toFixed(1)}</td>
                    ${branch.groups.map(g => `<td>${getGroupLiquid(g).toFixed(1)}</td>`).join('')}
                </tr>
                <tr>
                    <td>油量 (t)</td>
                    <td>${branch.oil.toFixed(1)}</td>
                    ${branch.groups.map(g => `<td>${getGroupOil(g).toFixed(1)}</td>`).join('')}
                </tr>
          <!-- 新增井数统计行 -->
          <tr>
            <td>井数 (口)</td>
            <td>${totalWells}</td>
            ${branch.groups.map(g  => `<td>${getGroupWellCount(g)}</td>`).join('')}
          </tr>
        </table>
        `;
    });
    container.innerHTML = html;
}

// 以下拖放功能保持不变
function allowDrop(ev) {
    ev.preventDefault(); 
    const container = ev.currentTarget; 
    if (container !== currentContainer) {
        currentContainer = container;
        placeholder = createPlaceholder();
    }
    
    const groups = container.children; 
    const mouseY = ev.clientY; 
    
    let closestIndex = 0;
    let minDistance = Infinity;
    
    for (let i = 0; i < groups.length;  i++) {
        const rect = groups[i].getBoundingClientRect();
        const distance = Math.abs(mouseY  - (rect.top  + rect.height/2)); 
        
        if (distance < minDistance) {
            minDistance = distance;
            closestIndex = mouseY > rect.top  + rect.height/2  ? i + 1 : i;
        }
    }
    
    // 更新占位符位置
    if (groups[closestIndex]) {
        groups[closestIndex].before(placeholder);
    } else {
        container.appendChild(placeholder); 
    }
}

function createPlaceholder() {
    const div = document.createElement('div'); 
    div.className  = 'drop-placeholder';
    return div;
}

function dragGroup(ev, groupName, fromBranch) {
    ev.dataTransfer.setData("group",  groupName);
    ev.dataTransfer.setData("fromBranch",  fromBranch);
    ev.target.classList.add('drag-ghost'); 
}

function dropGroup(ev, toBranchName) {
    ev.preventDefault(); 
    const groupName = ev.dataTransfer.getData("group"); 
    const fromBranchName = ev.dataTransfer.getData("fromBranch"); 
    
    // 移除占位符和样式
    if (placeholder && placeholder.parentNode)  {
        placeholder.parentNode.removeChild(placeholder); 
    }
    document.querySelectorAll('.drag-ghost').forEach(el  => {
        el.classList.remove('drag-ghost'); 
    });
    
    const fromBranch = branches.find(b  => b.name  === fromBranchName);
    const toBranch = branches.find(b  => b.name  === toBranchName);
    
    if (fromBranch && toBranch) {
        const index = fromBranch.groups.indexOf(groupName); 
        if (index > -1) {
            // 获取最终插入位置
            const container = ev.target.closest('.branch-groups'); 
            const finalIndex = Array.from(container.children) 
                .indexOf(placeholder) - 1; // 减去占位符自身
            
            // 执行数据更新
            fromBranch.groups.splice(index,  1);
            toBranch.groups.splice(finalIndex  >= 0 ? finalIndex : 0, 0, groupName);
            
            // 更新统计数据
            const liquid = getGroupLiquid(groupName);
            const oil = getGroupOil(groupName);
            fromBranch.liquid  -= liquid;
            fromBranch.oil  -= oil;
            toBranch.liquid  += liquid;
            toBranch.oil  += oil;
            
            renderBranchStats();
            renderGroupStats();
        }
    }
    
    // 重置状态
    currentContainer = null;
    placeholder = null;
    // 新增保存逻辑
    localStorage.setItem(STORAGE_KEY,  JSON.stringify(branches)); 
}

// 新增重置函数
function resetToOther() {
    // 保存原始井组数据
	    if (!confirm('确定要重置所有井组到未分配状态吗？')) return;
    const groupMap = new Map();
    JSON.parse(localStorage.getItem('wellData')).forEach(well  => {
        if (!groupMap.has(well.group))  {
            groupMap.set(well.group,  { liquid: 0, oil: 0 });
        }
        const group = groupMap.get(well.group); 
        group.liquid  += well.liquid; 
        group.oil  += well.oil; 
    });

    // 重置所有井组到"其他"
    branches = BRANCH_CONFIG.map(config  => ({
        ...config,
        groups: [],
        liquid: 0,
        oil: 0
    }));

    // 最后一个分支是"其他"
    const otherBranch = branches[branches.length - 1];
    groupMap.forEach((stats,  groupName) => {
        otherBranch.groups.push(groupName); 
        otherBranch.liquid  += stats.liquid; 
        otherBranch.oil  += stats.oil; 
    });

    localStorage.setItem(STORAGE_KEY,  JSON.stringify(branches)); 
    renderBranchStats();
    renderGroupStats();
}

// 新增恢复默认函数
function resetToDefault() {
	    if (!confirm('确定要恢复默认分配方案吗？')) return;
    processWellData(JSON.parse(localStorage.getItem('wellData'))); 
    localStorage.setItem(STORAGE_KEY,  JSON.stringify(branches)); 
    renderBranchStats();
    renderGroupStats();
}

function getGroupLiquid(groupName) {
  const savedData = JSON.parse(localStorage.getItem('wellData'));
  const subgroups = GROUP_MERGE_RULES[groupName] || [groupName];
  return subgroups.reduce((sum, g) => 
    sum + savedData.filter(w => w.group === g).reduce((s, w) => s + w.liquid, 0)
  , 0);
}

function getGroupOil(groupName) {
  const savedData = JSON.parse(localStorage.getItem('wellData')); 
  const subgroups = GROUP_MERGE_RULES[groupName] || [groupName]; // 获取合并子组
  return subgroups.reduce((sum,  g) => 
    sum + savedData.filter(w  => w.group  === g).reduce((s, w) => s + w.oil,  0)
  , 0);
}

document.addEventListener('DOMContentLoaded', init);