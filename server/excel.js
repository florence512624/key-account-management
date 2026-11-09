/**
 * 客户台账导出（真 .xlsx，不是改后缀的 CSV）。
 *
 * 生成两张表：
 *   1) 客户明细：带标题行、筛选、冻结窗格、风险高亮、金额千分位
 *   2) 商机汇总：阶段分布 / 健康度分布 / 负责人排行
 * 样式全部写死在服务端，用户拿到就能直接进周会材料。
 */
import ExcelJS from 'exceljs'

const STAGE_LABEL = { lead: '线索', following: '跟进', negotiation: '谈判', signed: '签约' }
const STAGE_FILL = {
  lead: 'FFF1F5F9',
  following: 'FFEFF6FF',
  negotiation: 'FFFFFBEB',
  signed: 'FFECFDF5'
}
const STAGE_TEXT = {
  lead: 'FF475569',
  following: 'FF1D4ED8',
  negotiation: 'FFB45309',
  signed: 'FF047857'
}

const HEADERS = [
  { key: 'index', header: '序号', width: 6, align: 'center' },
  { key: 'name', header: '客户名称', width: 26, align: 'left' },
  { key: 'industry', header: '行业', width: 14, align: 'left' },
  { key: 'scale', header: '规模', width: 8, align: 'center' },
  { key: 'stage', header: '阶段', width: 9, align: 'center' },
  { key: 'amount', header: '预估金额（元）', width: 16, align: 'right' },
  { key: 'health', header: '健康度', width: 8, align: 'center' },
  { key: 'risk', header: '风险等级', width: 9, align: 'center' },
  { key: 'owner', header: '负责人', width: 10, align: 'center' },
  { key: 'region', header: '大区', width: 10, align: 'center' },
  { key: 'stakeholders', header: '关键人数', width: 9, align: 'center' },
  { key: 'opposers', header: '反对者', width: 8, align: 'center' },
  { key: 'overdue', header: '逾期任务', width: 9, align: 'center' },
  { key: 'lastContact', header: '最近跟进', width: 12, align: 'center' },
  { key: 'signedAt', header: '签约日期', width: 12, align: 'center' },
  { key: 'note', header: '备注', width: 46, align: 'left' }
]

const COL_COUNT = HEADERS.length
const NAVY = 'FF0A1A30'
const HEADER_BG = 'FF17365C'
const HAIRLINE = 'FFE6EAF1'

const riskOf = (score) => (score >= 80 ? '健康' : score >= 60 ? '观察' : '高风险')
const riskColor = (score) => (score >= 80 ? 'FF047857' : score >= 60 ? 'FFB45309' : 'FFB91C1C')

const money = (n) => Number(n) || 0
const fmtDate = (v) => (v ? String(v).slice(0, 10) : '—')

function styleTitle (ws, text, subtitle) {
  ws.mergeCells(1, 1, 1, COL_COUNT)
  const title = ws.getCell(1, 1)
  title.value = text
  title.font = { name: 'Microsoft YaHei', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 34

  ws.mergeCells(2, 1, 2, COL_COUNT)
  const meta = ws.getCell(2, 1)
  meta.value = subtitle
  meta.font = { name: 'Microsoft YaHei', size: 10, color: { argb: 'FF64748B' } }
  meta.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(2).height = 24
}

function styleHeader (ws, rowNumber) {
  const row = ws.getRow(rowNumber)
  row.height = 26
  HEADERS.forEach((col, i) => {
    const cell = row.getCell(i + 1)
    cell.value = col.header
    cell.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
    cell.alignment = { vertical: 'middle', horizontal: col.align === 'right' ? 'right' : 'center' }
    cell.border = {
      top: { style: 'thin', color: { argb: HEADER_BG } },
      bottom: { style: 'thin', color: { argb: HEADER_BG } },
      left: { style: 'thin', color: { argb: HEADER_BG } },
      right: { style: 'thin', color: { argb: HEADER_BG } }
    }
  })
}

function styleDataRow (ws, rowNumber, item, index) {
  const row = ws.getRow(rowNumber)
  row.height = 22
  const stage = item.stage
  const values = [
    index + 1,
    item.name,
    item.industry,
    item.scale,
    STAGE_LABEL[stage] || stage,
    money(item.estimated_amount),
    item.health_score,
    riskOf(item.health_score),
    item.owner,
    item.region || '—',
    item.stakeholder_count,
    item.opposer_count,
    item.overdue_task_count,
    fmtDate(item.last_contact_date),
    fmtDate(item.signed_at),
    item.note || ''
  ]

  HEADERS.forEach((col, i) => {
    const cell = row.getCell(i + 1)
    cell.value = values[i]
    cell.font = { name: 'Microsoft YaHei', size: 10, color: { argb: 'FF1E293B' } }
    cell.alignment = {
      vertical: 'middle',
      horizontal: col.align === 'left' ? 'left' : col.align,
      wrapText: col.key === 'note'
    }
    cell.border = {
      bottom: { style: 'thin', color: { argb: HAIRLINE } },
      right: { style: 'thin', color: { argb: HAIRLINE } }
    }
    if (index % 2 === 1) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAFBFC' } }
    }
  })

  // 阶段：浅色底 + 同色字，扫一眼就能分段
  const stageCell = row.getCell(5)
  stageCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: STAGE_FILL[stage] || 'FFF8FAFC' } }
  stageCell.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: STAGE_TEXT[stage] || 'FF475569' } }

  // 金额：千分位、右对齐
  const amountCell = row.getCell(6)
  amountCell.numFmt = '#,##0'
  amountCell.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: 'FF0F172A' } }

  // 健康度 / 风险：低于 60 标红加粗
  const healthCell = row.getCell(7)
  const riskCell = row.getCell(8)
  healthCell.font = { name: 'Microsoft YaHei', size: 10, bold: item.health_score < 60, color: { argb: riskColor(item.health_score) } }
  riskCell.font = { name: 'Microsoft YaHei', size: 10, bold: item.health_score < 60, color: { argb: riskColor(item.health_score) } }

  // 反对者 / 逾期：有数才标红
  if (item.opposer_count > 0) {
    row.getCell(12).font = { name: 'Microsoft YaHei', size: 10, color: { argb: 'FFB91C1C' } }
  }
  if (item.overdue_task_count > 0) {
    row.getCell(13).font = { name: 'Microsoft YaHei', size: 10, color: { argb: 'FFB91C1C' } }
  }
}

function addSummarySheet (wb, items) {
  const ws = wb.addWorksheet('商机汇总', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'portrait', fitToPage: true, fitToWidth: 1 }
  })
  ws.columns = [
    { width: 22 }, { width: 14 }, { width: 20 }, { width: 12 }
  ]

  ws.mergeCells(1, 1, 1, 4)
  const title = ws.getCell(1, 1)
  title.value = '商机结构汇总'
  title.font = { name: 'Microsoft YaHei', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }
  title.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  title.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 34

  const totalAmount = items.reduce((s, a) => s + money(a.estimated_amount), 0)
  const pipeline = items.filter((a) => a.stage !== 'signed').reduce((s, a) => s + money(a.estimated_amount), 0)

  ws.mergeCells(2, 1, 2, 4)
  const meta = ws.getCell(2, 1)
  meta.value = `共 ${items.length} 家客户 · 金额合计 ${totalAmount.toLocaleString('zh-CN')} 元 · 在途 ${pipeline.toLocaleString('zh-CN')} 元`
  meta.font = { name: 'Microsoft YaHei', size: 10, color: { argb: 'FF64748B' } }
  meta.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(2).height = 24

  const sectionTitle = (rowIdx, text) => {
    ws.mergeCells(rowIdx, 1, rowIdx, 4)
    const c = ws.getCell(rowIdx, 1)
    c.value = text
    c.font = { name: 'Microsoft YaHei', size: 11, bold: true, color: { argb: NAVY } }
    c.alignment = { vertical: 'middle', indent: 1 }
    ws.getRow(rowIdx).height = 26
  }

  const tableHeader = (rowIdx, cols) => {
    const row = ws.getRow(rowIdx)
    cols.forEach((text, i) => {
      const c = row.getCell(i + 1)
      c.value = text
      c.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
      c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right' }
    })
    row.height = 24
  }

  const dataRow = (rowIdx, cols, { bold = false } = {}) => {
    const row = ws.getRow(rowIdx)
    cols.forEach((value, i) => {
      const c = row.getCell(i + 1)
      c.value = value
      c.font = { name: 'Microsoft YaHei', size: 10, bold, color: { argb: bold ? NAVY : 'FF334155' } }
      c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'right' }
      c.border = { bottom: { style: 'thin', color: { argb: HAIRLINE } } }
    })
    row.height = 22
  }

  // ---- 阶段分布 ----
  let r = 3
  sectionTitle(r++, '一、阶段分布')
  tableHeader(r++, ['阶段', '客户数', '金额（元）', '金额占比'])
  const stages = ['lead', 'following', 'negotiation', 'signed']
  for (const stage of stages) {
    const group = items.filter((a) => a.stage === stage)
    const amount = group.reduce((s, a) => s + money(a.estimated_amount), 0)
    dataRow(r++, [
      STAGE_LABEL[stage],
      group.length,
      amount,
      totalAmount ? amount / totalAmount : 0
    ])
    ws.getRow(r - 1).getCell(3).numFmt = '#,##0'
    ws.getRow(r - 1).getCell(4).numFmt = '0.0%'
  }
  dataRow(r++, ['合计', items.length, totalAmount, 1], { bold: true })
  ws.getRow(r - 1).getCell(3).numFmt = '#,##0'
  ws.getRow(r - 1).getCell(4).numFmt = '0.0%'

  // ---- 健康度分布 ----
  r += 1
  sectionTitle(r++, '二、健康度分布')
  tableHeader(r++, ['健康度区间', '客户数', '金额（元）', '金额占比'])
  const buckets = [
    ['健康（80-100）', (a) => a.health_score >= 80],
    ['观察（60-79）', (a) => a.health_score >= 60 && a.health_score < 80],
    ['高风险（<60）', (a) => a.health_score < 60]
  ]
  for (const [label, test] of buckets) {
    const group = items.filter(test)
    const amount = group.reduce((s, a) => s + money(a.estimated_amount), 0)
    dataRow(r++, [label, group.length, amount, totalAmount ? amount / totalAmount : 0])
    ws.getRow(r - 1).getCell(3).numFmt = '#,##0'
    ws.getRow(r - 1).getCell(4).numFmt = '0.0%'
  }

  // ---- 负责人排行 ----
  r += 1
  sectionTitle(r++, '三、负责人商机排行')
  tableHeader(r++, ['负责人', '客户数', '在途金额（元）', '在途占比'])
  const owners = new Map()
  for (const a of items) {
    if (a.stage === 'signed') continue
    const rec = owners.get(a.owner) || { count: 0, amount: 0 }
    rec.count += 1
    rec.amount += money(a.estimated_amount)
    owners.set(a.owner, rec)
  }
  for (const [owner, rec] of [...owners.entries()].sort((x, y) => y[1].amount - x[1].amount)) {
    dataRow(r++, [owner, rec.count, rec.amount, pipeline ? rec.amount / pipeline : 0])
    ws.getRow(r - 1).getCell(3).numFmt = '#,##0'
    ws.getRow(r - 1).getCell(4).numFmt = '0.0%'
  }

  return ws
}

export async function buildAccountsWorkbook ({ items, filters = {}, generatedAt = new Date() }) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Key Account Management'
  wb.created = generatedAt
  wb.company = 'Local Deployment'

  const ws = wb.addWorksheet('客户明细', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 }
    }
  })

  HEADERS.forEach((col, i) => { ws.getColumn(i + 1).width = col.width })

  const stamp = `${generatedAt.getFullYear()}-${String(generatedAt.getMonth() + 1).padStart(2, '0')}-${String(generatedAt.getDate()).padStart(2, '0')} ${String(generatedAt.getHours()).padStart(2, '0')}:${String(generatedAt.getMinutes()).padStart(2, '0')}`
  const filterText = [
    filters.stage ? `阶段=${STAGE_LABEL[filters.stage] || filters.stage}` : '阶段=全部',
    filters.q ? `关键词=${filters.q}` : null,
    filters.sort ? `排序=${filters.sort}` : null
  ].filter(Boolean).join(' ｜ ')

  styleTitle(ws, 'Key Account Management · 客户台账', `导出时间 ${stamp}　｜　${filterText} ｜ 共 ${items.length} 家`)
  styleHeader(ws, 3)

  items.forEach((item, idx) => styleDataRow(ws, idx + 4, item, idx))

  const lastRow = 3 + items.length
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: lastRow, column: COL_COUNT } }

  // 合计行
  const totalRow = ws.getRow(lastRow + 1)
  totalRow.height = 24
  ws.mergeCells(lastRow + 1, 1, lastRow + 1, 5)
  const totalLabel = totalRow.getCell(1)
  totalLabel.value = `合计 ${items.length} 家`
  totalLabel.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: NAVY } }
  totalLabel.alignment = { vertical: 'middle', horizontal: 'right', indent: 1 }

  const totalAmountCell = totalRow.getCell(6)
  totalAmountCell.value = items.reduce((s, a) => s + money(a.estimated_amount), 0)
  totalAmountCell.numFmt = '#,##0'
  totalAmountCell.font = { name: 'Microsoft YaHei', size: 10, bold: true, color: { argb: NAVY } }
  totalAmountCell.alignment = { vertical: 'middle', horizontal: 'right' }
  totalAmountCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }

  for (let c = 1; c <= COL_COUNT; c++) {
    totalRow.getCell(c).border = { top: { style: 'medium', color: { argb: 'FFCBD5E1' } } }
  }

  addSummarySheet(wb, items)

  const buffer = await wb.xlsx.writeBuffer()
  return Buffer.from(buffer)
}
