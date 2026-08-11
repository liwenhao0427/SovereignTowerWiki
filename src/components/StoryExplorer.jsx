import React, { useEffect, useMemo, useState } from 'react';

const kindLabels = {
  audience: '觐见',
  affinity: '好感对话',
  conversation: '骑士会话',
  dialogue: '剧情对话',
};

const PAGE_SIZE = 8;
const truncate = (value, length = 22) => String(value || '').trim().length > length ? `${String(value).trim().slice(0, length)}…` : String(value || '').trim();
const flowTitle = (flow) => `${flow.displayName} · ${truncate(flow.firstLine)}`;

function assetUrl(path) {
  if (!path) return '';
  return `${import.meta.env.BASE_URL}${path}`;
}

function getSelectedChoice(group, selections) {
  return group.choices[selections[group.inkPath] ?? 0] || group.choices[0];
}

function choiceLabel(choice) {
  if (!choice?.rewind) return choice?.text || '';
  const knowledge = (choice.conditions || [])
    .map((condition) => condition.match(/^未来获知：(.+?)(?:；正常解锁：|$)/)?.[1])
    .map((value) => value.replace(/^已知/, '').replace(/^未分类未来信息：/, ''))
    .filter(Boolean);
  const suffix = knowledge.length ? `须知道「${knowledge.join('」「')}」知识后回溯` : '须获得相关知识后回溯';
  return `${choice.text}（${suffix}）`;
}

function flowSearchText(flow) {
  const dialogue = flow.groups.flatMap((group) => [
    ...group.context.map((line) => line.text),
    ...group.choices.flatMap((choice) => [
      choice.text,
      ...choice.conditions,
      ...choice.dialogue.map((line) => line.text),
      ...choice.immediateEffects.map((effect) => effect.text),
      ...choice.effects.map((effect) => effect.text),
    ]),
  ]);
  return [
    flow.displayName,
    flow.firstLine,
    flow.inkPath,
    flow.conditions.join(' '),
    flow.relatedQuests.map((quest) => `${quest.name} ${quest.description}`).join(' '),
    ...flow.staticLines,
    ...dialogue,
  ].join(' ').toLowerCase();
}

function forwardWheel(event) {
  const scroller = event.currentTarget.querySelector('.story-entry-list, .embedded-history');
  if (!scroller || scroller.scrollHeight <= scroller.clientHeight) return;
  scroller.scrollTop += event.deltaY;
  event.preventDefault();
  event.stopPropagation();
}

function mergeDialogueItems(items) {
  const merged = [];
  for (const item of items) {
    const previous = merged.at(-1);
    if (item.type === 'dialogue' && previous?.type === 'dialogue' && previous.speaker === item.speaker) {
      previous.text = `${previous.text}\n${item.text}`;
    } else merged.push({ ...item });
  }
  return merged;
}

function useReaderSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      return { fontSize: 14, paragraphGap: 14, mergeSpeakers: false, ...JSON.parse(localStorage.getItem('wiki-reader-settings') || '{}') };
    } catch {
      return { fontSize: 14, paragraphGap: 14, mergeSpeakers: false };
    }
  });
  const update = (changes) => setSettings((current) => {
    const next = { ...current, ...changes };
    localStorage.setItem('wiki-reader-settings', JSON.stringify(next));
    return next;
  });
  return [settings, update];
}

function DialogueText({ text }) {
  return String(text).split('\n').map((line, index) => <React.Fragment key={`${line}-${index}`}>{index > 0 && <br />}{line}</React.Fragment>);
}

function buildHistory(flow, selections) {
  if (!flow?.groups.length) return [];
  const groups = new Map(flow.groups.map((group) => [group.inkPath, group]));
  const incoming = new Set(flow.groups.flatMap((group) => group.choices.map((choice) => choice.nextGroupId).filter(Boolean)));
  let group = flow.groups.find((item) => !incoming.has(item.inkPath)) || flow.groups[0];
  const visited = new Set();
  const history = [];
  let first = true;
  while (group && !visited.has(group.inkPath)) {
    visited.add(group.inkPath);
    if (first || !history.length) history.push(...group.context.map((line) => ({ ...line, type: 'dialogue' })));
    const choiceIndex = selections[group.inkPath] ?? 0;
    const choice = getSelectedChoice(group, selections);
    history.push({ type: 'choice', group, choice, choiceIndex });
    history.push({ type: 'result', choice });
    history.push(...choice.dialogue.map((line) => ({ ...line, type: 'dialogue' })));
    group = groups.get(choice.nextGroupId);
    first = false;
  }
  return history;
}

function FlowDirectory({ flows, selectedId, filter, query, onFilter, onQuery, onSelect, onClose }) {
  const [page, setPage] = useState(1);
  const [expandedPerson, setExpandedPerson] = useState('');
  const filtered = useMemo(() => flows.filter((flow) => {
    if (filter !== 'all' && flow.kind !== filter) return false;
    return !query || flowSearchText(flow).includes(query.toLowerCase());
  }), [flows, filter, query]);
  const people = useMemo(() => {
    const groups = new Map();
    for (const flow of filtered) {
      const primary = flow.characterDetails[0];
      const id = primary?.id || 'other';
      const person = groups.get(id) || {
        id,
        name: primary?.name || '其他剧情',
        portrait: primary?.portrait || flow.portrait,
        order: flow.characterOrder,
        flows: [],
      };
      person.flows.push(flow);
      groups.set(id, person);
    }
    return [...groups.values()].sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name, 'zh-CN'));
  }, [filtered]);
  const pageCount = Math.max(1, Math.ceil(people.length / PAGE_SIZE));
  const pageItems = people.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); setExpandedPerson(''); }, [filter, query]);
  useEffect(() => { if (page > pageCount) setPage(pageCount); }, [page, pageCount]);
  useEffect(() => {
    const selectedFlow = flows.find((flow) => flow.id === selectedId);
    const personId = selectedFlow?.characterDetails[0]?.id || (selectedFlow ? 'other' : '');
    const personIndex = people.findIndex((person) => person.id === personId);
    if (personId) setExpandedPerson(personId);
    if (personIndex >= 0) setPage(Math.floor(personIndex / PAGE_SIZE) + 1);
  }, [flows, people, selectedId]);

  return <aside className="story-directory" onWheel={forwardWheel}>
    <div className="story-directory-head"><button className="mobile-directory-close" onClick={onClose} aria-label="关闭筛选">×</button><span className="eyebrow">CHARACTER STORIES</span><h2>人物剧情</h2><p>{people.length} 个人物 · {filtered.length} 条对话</p></div>
    <label className="story-search"><span>⌕</span><input value={query} onChange={(event) => onQuery(event.target.value)} placeholder="搜索人物、对白、选项、结果或条件" /></label>
    <div className="story-kind-tabs">
      {[['audience', '觐见'], ['affinity', '好感'], ['conversation', '骑士会话'], ['all', '全部入口']].map(([value, label]) => <button className={filter === value ? 'active' : ''} key={value} onClick={() => onFilter(value)}>{label}</button>)}
    </div>
    <div className="story-entry-list character-tree">
      {pageItems.map((person) => <section className={`character-group ${expandedPerson === person.id ? 'expanded' : ''}`} key={person.id}>
        <button className="character-row" onClick={() => setExpandedPerson((current) => current === person.id ? '' : person.id)}>
          <span className="character-row-portrait">{person.portrait ? <img src={assetUrl(person.portrait)} alt="" /> : <b>{person.name.slice(0, 1)}</b>}</span>
          <span><strong>{person.name}</strong><small>{person.flows.length} 条对话</small></span>
          <i>{expandedPerson === person.id ? '−' : '+'}</i>
        </button>
        {expandedPerson === person.id && <div className="character-dialogues">{person.flows.map((flow) => <button className={`dialogue-row ${selectedId === flow.id ? 'active' : ''}`} key={flow.id} onClick={() => { onSelect(flow.id); onClose(); }}>
          <span className={`entry-kind kind-${flow.kind}`}>{kindLabels[flow.kind] || '剧情'}</span>
          <strong title={flow.firstLine}>{truncate(flow.firstLine, 30)}</strong>
          <small>{flow.groups.length ? `${flow.groups.reduce((sum, group) => sum + group.choices.length, 0)} 条可选分支` : `${flow.staticLines.length} 条文本`}</small>
        </button>)}</div>}
      </section>)}
    </div>
    <div className="story-pagination"><button disabled={page === 1} onClick={() => setPage((value) => value - 1)}>上一页</button><span>{page} / {pageCount}</span><button disabled={page === pageCount} onClick={() => setPage((value) => value + 1)}>下一页</button></div>
  </aside>;
}

function FlowCanvas({ flow, relationsOpen, onToggleRelations }) {
  if (!flow) return <div className="story-empty">没有匹配的剧情路线。</div>;
  const questCount = flow.relatedQuests.length;
  const height = Math.max(520, questCount * 150 + 180);
  const centerY = height / 2;
  return <div className="story-canvas-scroll"><div className="story-canvas flow-canvas" style={{ height }}>
    {relationsOpen && <svg className="story-edges" viewBox={`0 0 1000 ${height}`} preserveAspectRatio="none" aria-hidden="true">{flow.relatedQuests.map((quest, index) => { const y = centerY - ((questCount - 1) * 140) / 2 + index * 140; return <path key={quest.id} d={`M 470 ${centerY} C 550 ${centerY}, 570 ${y}, 650 ${y}`} />; })}</svg>}
    <article className="flow-node" style={{ top: centerY - 115 }}>
      <div className="flow-node-portrait">{flow.portrait ? <img src={assetUrl(flow.portrait)} alt="" /> : <span>{flow.displayName.slice(0, 1)}</span>}</div>
      <div className="flow-node-copy"><span className={`entry-kind kind-${flow.kind}`}>{kindLabels[flow.kind] || '剧情'}</span><h3>{flowTitle(flow)}</h3><code>{flow.inkPath}</code><p>{flow.groups.length ? `${flow.groups.length} 组选项已合并为一条对话流` : flow.staticLines.length ? `已从完整 Ink 提取 ${flow.staticLines.length} 条文本` : '静态入口已确认，暂无可见文本'}</p></div>
      {questCount > 0 && <button className={`relation-plus ${relationsOpen ? 'active' : ''}`} onClick={onToggleRelations} title="展开关联任务">{relationsOpen ? '−' : '+'}<small>{questCount}</small></button>}
    </article>
    {relationsOpen && flow.relatedQuests.map((quest, index) => <article className="quest-node" key={quest.id} style={{ top: centerY - ((questCount - 1) * 140) / 2 + index * 140 - 55 }}><span>任务</span><h4>{quest.name}</h4><p>{quest.description}</p><code>{quest.id}</code></article>)}
  </div></div>;
}

function EffectSummary({ choice }) {
  const effects = [...choice.immediateEffects, ...choice.effects];
  if (!effects.length && !choice.conditions.length) return null;
  return <div className="history-result"><span>当前选择结果</span>{choice.conditions.map((condition) => <p className="history-condition" key={condition}>出现条件：{condition.replace(/^条件：/, '')}</p>)}{effects.map((effect, index) => <p key={`${effect.text}-${index}`}>{effect.text}</p>)}</div>;
}

function EntryConditions({ flow }) {
  const conditions = flow?.conditions || [];
  return <section className="entry-conditions"><div className="entry-conditions-title">出现条件</div>{conditions.length ? conditions.map((condition) => <p key={condition}>{condition}</p>) : <p className="entry-condition-empty">入口资源未解析到显式出现条件。</p>}</section>;
}

function HistoryPanel({ flow, selections, characters, mode, onChoice, onModeChange }) {
  const [settings, updateSettings] = useReaderSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const rawHistory = buildHistory(flow, selections);
  const history = settings.mergeSpeakers ? mergeDialogueItems(rawHistory) : rawHistory;
  const primary = flow?.characterDetails?.[0];
  const staticLines = settings.mergeSpeakers && flow?.staticLines.length ? [flow.staticLines.join('\n')] : flow?.staticLines || [];
  const panelStyle = { '--reader-font-size': `${settings.fontSize}px`, '--reader-paragraph-gap': `${settings.paragraphGap}px` };
  return <aside className="story-history-panel" style={panelStyle} onWheel={forwardWheel}>
    <header><div>{flow?.portrait && <img src={assetUrl(flow.portrait)} alt="" />}<span><small>{kindLabels[flow?.kind] || '剧情对话'}</small><strong>{flow ? flowTitle(flow) : '剧情详情'}</strong></span></div><div className="history-panel-actions"><button onClick={() => setSettingsOpen((value) => !value)} aria-expanded={settingsOpen}>设置</button>{mode === 'full' ? <button onClick={() => onModeChange('split')}>收起</button> : <><button onClick={() => onModeChange('full')}>展开</button><button onClick={() => onModeChange('hidden')}>隐藏</button></>}</div><code>{flow?.inkPath}</code></header>
    {settingsOpen && <div className="reader-settings">
      <label className="reader-setting-row"><span>字体大小</span><input type="range" min="12" max="24" step="1" value={settings.fontSize} onChange={(event) => updateSettings({ fontSize: Number(event.target.value) })} /><output>{settings.fontSize}px</output></label>
      <label className="reader-setting-row"><span>段落间距</span><input type="range" min="6" max="32" step="2" value={settings.paragraphGap} onChange={(event) => updateSettings({ paragraphGap: Number(event.target.value) })} /><output>{settings.paragraphGap}px</output></label>
      <label className="reader-setting-toggle"><input type="checkbox" checked={settings.mergeSpeakers} onChange={(event) => updateSettings({ mergeSpeakers: event.target.checked })} /><span>合并同一人物的连续对白</span></label>
    </div>}
    {!flow?.groups.length ? <div className="embedded-history static-history"><EntryConditions flow={flow} />{staticLines.length ? staticLines.map((text, index) => <div className="history-line" key={`${text}-${index}`}><span>{primary?.name || flow.displayName}</span><p><DialogueText text={text} /></p></div>) : <div className="history-empty"><h3>剧情入口已确认</h3><p>参与人物：{flow?.characterDetails.map((item) => item.name).join('、') || '尚未解析'}</p><small>完整 Ink 中未提取到可见文本。</small></div>}<footer><span>静态 Ink 文本</span><code>{flow?.source}</code><small>完整编译剧情提取，分支执行结果尚未实机验证</small></footer></div> : <div className="embedded-history"><EntryConditions flow={flow} />
      {history.map((item, index) => {
        if (item.type === 'choice') return <div className="history-choice embedded-choice" key={`${item.group.inkPath}-${index}`}><span>君王</span><div className="reader-options">{item.group.choices.map((choice, choiceIndex) => <button className={`${item.choiceIndex === choiceIndex ? 'active ' : ''}${choice.rewind ? 'rewind-choice' : ''}`} key={choice.sourcePath} onClick={() => onChoice(item.group.inkPath, choiceIndex)}>{choice.rewind && <em className="rewind-badge">回溯</em>}{choiceLabel(choice)}{choice.conditions.map((condition) => <small key={condition}>{condition}</small>)}</button>)}</div></div>;
        if (item.type === 'result') return <EffectSummary choice={item.choice} key={`result-${index}`} />;
        const character = characters[item.speaker];
        return <div className={`history-line ${item.speaker === 'sovereign' ? 'sovereign' : ''}`} key={`${item.text}-${index}`}><span>{character?.name || (item.speaker === 'narrator' ? '旁白' : item.speaker)}</span><p><DialogueText text={item.text} /></p></div>;
      })}
      <footer><span>资料证据</span><code>{flow.source}</code><small>{flow.hasRuntimeEvidence ? '完整 Ink 静态执行，条件与效果由 FutureSight 实机预演补充' : '完整 Ink 静态执行，选项与对白尚未实机验证'}</small></footer>
    </div>}
  </aside>;
}

export default function StoryExplorer({ storyGraph }) {
  const flows = storyGraph.flows;
  const defaultFlow = flows.find((flow) => flow.inkPath === 'intro_worker_grievance') || flows.find((flow) => flow.groups.length) || flows[0];
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(defaultFlow?.id);
  const [selections, setSelections] = useState({});
  const [relationsOpen, setRelationsOpen] = useState(false);
  const [historyMode, setHistoryMode] = useState('full');
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const selected = flows.find((flow) => flow.id === selectedId) || defaultFlow;

  useEffect(() => { setSelections({}); setRelationsOpen(false); }, [selectedId]);
  const selectChoice = (groupId, index) => setSelections((current) => ({ ...current, [groupId]: index }));

  return <div className="story-explorer-page">
    <div className="story-statusbar"><div><span className="eyebrow">THE LIVING ARCHIVE</span><b>完整剧情流</b></div><div className="story-stats"><span><strong>{storyGraph.stats.executableFlows}</strong> 条可执行剧情流</span><span><strong>{storyGraph.stats.recordedGroups}</strong> 组选项</span><span><strong>{storyGraph.stats.recordedBranches}</strong> 条分支</span></div><div className="evidence-legend"><span className="runtime-dot" />实机验证 <span className="static-dot" />静态执行</div></div>
    <div className={`story-workspace history-${historyMode} ${directoryOpen ? 'directory-open' : ''}`}>
      <button className="mobile-filter-toggle" onClick={() => setDirectoryOpen((value) => !value)} aria-expanded={directoryOpen}>筛选</button>
      <FlowDirectory flows={flows} selectedId={selectedId} filter={filter} query={query} onFilter={setFilter} onQuery={setQuery} onSelect={setSelectedId} onClose={() => setDirectoryOpen(false)} />
      {directoryOpen && <button className="directory-backdrop" onClick={() => setDirectoryOpen(false)} aria-label="关闭筛选" />}
      <section className="graph-pane"><div className="graph-toolbar"><div><b>剧情关系图</b><span>每个节点代表一条完整对话流，点击 + 展开关联任务</span></div><div className="graph-legend"><span>人物 = 对话流</span><span>卷轴 = 任务</span></div></div><FlowCanvas flow={selected} relationsOpen={relationsOpen} onToggleRelations={() => setRelationsOpen((value) => !value)} /></section>
      {historyMode !== 'hidden' && <HistoryPanel flow={selected} selections={selections} characters={storyGraph.characters} mode={historyMode} onChoice={selectChoice} onModeChange={setHistoryMode} />}
      {historyMode === 'hidden' && <button className="history-restore" onClick={() => setHistoryMode('full')}>展开对话</button>}
    </div>
  </div>;
}
