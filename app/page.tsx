'use client';

import { useEffect, useMemo, useState } from 'react';

type Category = '課題' | '自習' | 'アルバイト' | 'トレーニング' | 'その他';

type SortType = 'new' | 'old' | 'due' | 'priority';

type Priority = '高' | '中' | '低';

type Task = {
  id: string;
  title: string;
  done: boolean;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  due?: string;
  category: Category;
  priority: Priority;
  tags: string[];
  estimateMin?: number;
  ifCondition?: string;
  thenAction?: string;
};

const STORAGE_KEY = 'graduation_task_app_prototype_v1';

const CATEGORY_OPTIONS: Category[] = ['課題', '自習', 'アルバイト', 'トレーニング', 'その他'];
const PRIORITY_OPTIONS: Priority[] = ['高', '中', '低'];

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    )
  );
}

function buildMinuteOptions(step = 10, maxMin = 8 * 60) {
  const options: number[] = [];
  for (let m = step; m <= maxMin; m += step) options.push(m);
  return options;
}

function formatMinutes(min?: number) {
  if (!min) return '未設定';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}分`;
  if (m === 0) return `${h}時間`;
  return `${h}時間${m}分`;
}

function formatDateTime(timestamp?: number) {
  if (!timestamp) return '未記録';
  return new Intl.DateTimeFormat('ja-JP', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function getActualMinutes(task: Pick<Task, 'startedAt' | 'completedAt'>) {
  if (!task.startedAt || !task.completedAt) return undefined;
  return Math.max(1, Math.round((task.completedAt - task.startedAt) / 60000));
}

function normalizeCategory(value: unknown): Category {
  return CATEGORY_OPTIONS.includes(value as Category) ? (value as Category) : '課題';
}

function normalizePriority(value: unknown): Priority {
  return PRIORITY_OPTIONS.includes(value as Priority) ? (value as Priority) : '中';
}

function getPriorityScore(priority: Priority) {
  if (priority === '高') return 3;
  if (priority === '中') return 2;
  return 1;
}

export default function Home() {
  const [tasks, setTasks] = useState<Task[]>([]);

  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [category, setCategory] = useState<Category>('課題');
  const [priority, setPriority] = useState<Priority>('中');
  const [tagsInput, setTagsInput] = useState('');
  const [estimateMin, setEstimateMin] = useState<number | ''>('');
  const [ifCondition, setIfCondition] = useState('');
  const [thenAction, setThenAction] = useState('');

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortType>('new');
  const [filterCategory, setFilterCategory] = useState<'all' | Category>('all');
  const [showDone, setShowDone] = useState(true);

  const minuteOptions = useMemo(() => buildMinuteOptions(10, 8 * 60), []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as Partial<Task>[];
      const normalized: Task[] = parsed.map((task) => ({
        id: task.id ?? uid(),
        title: task.title ?? '',
        done: Boolean(task.done),
        createdAt: task.createdAt ?? Date.now(),
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        due: task.due,
        category: normalizeCategory(task.category),
        priority: normalizePriority(task.priority),
        tags: Array.isArray(task.tags) ? task.tags : [],
        estimateMin: task.estimateMin,
        ifCondition: task.ifCondition,
        thenAction: task.thenAction,
      }));

      setTasks(normalized);
    } catch {
      setTasks([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = tasks;

    if (q) {
      list = list.filter((task) => {
        const text = [
          task.title,
          task.category,
          task.priority,
          task.ifCondition ?? '',
          task.thenAction ?? '',
          ...task.tags,
        ]
          .join(' ')
          .toLowerCase();
        return text.includes(q);
      });
    }

    if (filterCategory !== 'all') {
      list = list.filter((task) => task.category === filterCategory);
    }

    if (!showDone) {
      list = list.filter((task) => !task.done);
    }

    const sorted = [...list];

    if (sort === 'new') sorted.sort((a, b) => b.createdAt - a.createdAt);
    if (sort === 'old') sorted.sort((a, b) => a.createdAt - b.createdAt);
    if (sort === 'priority') sorted.sort((a, b) => getPriorityScore(b.priority) - getPriorityScore(a.priority));
    if (sort === 'due') {
      sorted.sort((a, b) => {
        const ad = a.due ?? '9999-12-31';
        const bd = b.due ?? '9999-12-31';
        return ad.localeCompare(bd);
      });
    }

    return sorted;
  }, [tasks, query, filterCategory, showDone, sort]);

  const summary = useMemo(() => {
    const total = tasks.length;
    const started = tasks.filter((task) => task.startedAt).length;
    const done = tasks.filter((task) => task.done).length;
    const withEstimate = tasks.filter((task) => task.estimateMin).length;
    const startRate = total === 0 ? 0 : Math.round((started / total) * 100);
    const completeRate = total === 0 ? 0 : Math.round((done / total) * 100);

    const errorTargets = tasks.filter((task) => task.estimateMin && getActualMinutes(task));
    const averageError =
      errorTargets.length === 0
        ? undefined
        : Math.round(
            errorTargets.reduce((sum, task) => {
              const actualMin = getActualMinutes(task) ?? 0;
              return sum + Math.abs(actualMin - (task.estimateMin ?? 0));
            }, 0) / errorTargets.length
          );

    return {
      total,
      started,
      done,
      withEstimate,
      startRate,
      completeRate,
      averageError,
    };
  }, [tasks]);

  function addTask() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    const newTask: Task = {
      id: uid(),
      title: trimmedTitle,
      done: false,
      createdAt: Date.now(),
      due: due || undefined,
      category,
      priority,
      tags: normalizeTags(tagsInput),
      estimateMin: estimateMin === '' ? undefined : estimateMin,
      ifCondition: ifCondition.trim() || undefined,
      thenAction: thenAction.trim() || undefined,
    };

    setTasks((prev) => [newTask, ...prev]);

    setTitle('');
    setDue('');
    setCategory('課題');
    setPriority('中');
    setTagsInput('');
    setEstimateMin('');
    setIfCondition('');
    setThenAction('');
  }

  function startTask(id: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? {
              ...task,
              startedAt: task.startedAt ?? Date.now(),
            }
          : task
      )
    );
  }

  function completeTask(id: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? {
              ...task,
              done: true,
              startedAt: task.startedAt ?? Date.now(),
              completedAt: task.completedAt ?? Date.now(),
            }
          : task
      )
    );
  }

  function reopenTask(id: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? {
              ...task,
              done: false,
              completedAt: undefined,
            }
          : task
      )
    );
  }

  function removeTask(id: string) {
    const ok = window.confirm('このタスクを削除しますか？');
    if (!ok) return;
    setTasks((prev) => prev.filter((task) => task.id !== id));
  }

  function clearDone() {
    const ok = window.confirm('完了済みタスクを一括削除しますか？');
    if (!ok) return;
    setTasks((prev) => prev.filter((task) => !task.done));
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'task-log.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 text-slate-900">
      <div className="mx-auto max-w-4xl space-y-5">
        <header className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-blue-600">卒業制作 試作版</p>
          <h1 className="mt-1 text-2xl font-bold">タスク管理Webアプリ</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            タスクの見積もり時間、If-Thenプラン、着手・完了ログ、実測時間を記録し、計画が行動につながったかを確認できます。
          </p>
        </header>

        <section className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">総タスク</p>
            <p className="mt-1 text-2xl font-bold">{summary.total}</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">着手率</p>
            <p className="mt-1 text-2xl font-bold">{summary.startRate}%</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">完了率</p>
            <p className="mt-1 text-2xl font-bold">{summary.completeRate}%</p>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <p className="text-xs text-slate-500">平均見積もり誤差</p>
            <p className="mt-1 text-2xl font-bold">{summary.averageError === undefined ? '-' : `${summary.averageError}分`}</p>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">タスクの追加</h2>

          <div className="mt-4 grid gap-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTask()}
              placeholder="タスク名 例：卒論の背景を書く"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-base outline-none focus:border-blue-500"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                期限
                <input
                  type="date"
                  value={due}
                  onChange={(e) => setDue(e.target.value)}
                  className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                />
              </label>

              <label className="grid gap-1 text-sm font-medium text-slate-700">
                見積もり時間
                <select
                  value={estimateMin}
                  onChange={(e) => setEstimateMin(e.target.value === '' ? '' : Number(e.target.value))}
                  className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                >
                  <option value="">未設定</option>
                  {minuteOptions.map((m) => (
                    <option key={m} value={m}>
                      {formatMinutes(m)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium text-slate-700">
                カテゴリ
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm font-medium text-slate-700">
                優先度
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className="rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
                >
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="タグ・メモ 例：レポート, 重要, 手書き"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
            />

            <div className="rounded-2xl bg-blue-50 p-4">
              <p className="text-sm font-bold text-blue-800">If-Thenプラン</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <input
                  value={ifCondition}
                  onChange={(e) => setIfCondition(e.target.value)}
                  placeholder="If：例 授業が終わったら"
                  className="rounded-2xl border border-blue-200 px-4 py-3 outline-none focus:border-blue-500"
                />
                <input
                  value={thenAction}
                  onChange={(e) => setThenAction(e.target.value)}
                  placeholder="Then：例 図書館で30分進める"
                  className="rounded-2xl border border-blue-200 px-4 py-3 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <button
              onClick={addTask}
              className="rounded-2xl bg-blue-600 px-4 py-3 font-bold text-white shadow-sm active:scale-[0.99]"
            >
              タスクを追加
            </button>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <div className="grid gap-3">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="検索：タイトル・タグ・If-Then"
              className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-blue-500"
            />

            <div className="grid gap-3 sm:grid-cols-4">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortType)}
                className="rounded-2xl border border-slate-300 px-4 py-3"
              >
                <option value="due">期限順</option>
                <option value="new">新しい順</option>
                <option value="old">古い順</option>
                <option value="priority">優先度順</option>
              </select>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value as 'all' | Category)}
                className="rounded-2xl border border-slate-300 px-4 py-3"
              >
                <option value="all">カテゴリ：すべて</option>
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setShowDone((prev) => !prev)}
                className="rounded-2xl border border-slate-300 px-4 py-3 font-semibold"
              >
                {showDone ? '完了も表示' : '未完了のみ'}
              </button>

              <button onClick={exportJson} className="rounded-2xl border border-slate-300 px-4 py-3 font-semibold">
                ログ出力
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-3">
          {filteredTasks.map((task) => {
            const actualMin = getActualMinutes(task);
            const estimateError = task.estimateMin && actualMin ? actualMin - task.estimateMin : undefined;

            return (
              <article key={task.id} className="rounded-3xl bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">{task.category}</span>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold">優先度：{task.priority}</span>
                      {task.done && <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700">完了</span>}
                    </div>
                    <h3 className={`mt-3 text-lg font-bold ${task.done ? 'text-slate-400 line-through' : ''}`}>{task.title}</h3>
                  </div>

                  <button onClick={() => removeTask(task.id)} className="rounded-xl px-3 py-2 text-sm font-bold text-red-600">
                    削除
                  </button>
                </div>

                <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                  <p>期限：{task.due ?? '期限なし'}</p>
                  <p>見積もり：{formatMinutes(task.estimateMin)}</p>
                  <p>実際にかかった時間：{formatMinutes(actualMin)}</p>
                  <p>着手：{formatDateTime(task.startedAt)}</p>
                  <p>完了：{formatDateTime(task.completedAt)}</p>
                </div>

                {(task.ifCondition || task.thenAction) && (
                  <div className="mt-4 rounded-2xl bg-blue-50 p-4 text-sm text-blue-900">
                    <p className="font-bold">If-Then</p>
                    <p className="mt-1">If：{task.ifCondition || '未設定'}</p>
                    <p>Then：{task.thenAction || '未設定'}</p>
                  </div>
                )}

                {task.tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {task.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <button onClick={() => startTask(task.id)} className="rounded-2xl bg-slate-900 px-4 py-3 font-bold text-white">
                    着手
                  </button>

                  {task.done ? (
                    <button onClick={() => reopenTask(task.id)} className="rounded-2xl border border-slate-300 px-4 py-3 font-bold">
                      未完了に戻す
                    </button>
                  ) : (
                    <button onClick={() => completeTask(task.id)} className="rounded-2xl bg-green-600 px-4 py-3 font-bold text-white">
                      完了
                    </button>
                  )}
                </div>

                {estimateError !== undefined && (
                  <p className="mt-3 text-sm font-semibold text-slate-700">
                    見積もりとの差：{estimateError > 0 ? '+' : ''}
                    {estimateError}分
                  </p>
                )}
              </article>
            );
          })}

          {filteredTasks.length === 0 && (
            <div className="rounded-3xl bg-white p-8 text-center text-slate-500 shadow-sm">該当するタスクがありません。</div>
          )}
        </section>

        <section className="rounded-3xl bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold">管理</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <button onClick={clearDone} className="rounded-2xl border border-slate-300 px-4 py-3 font-bold">
              完了済みを一括削除
            </button>
            <button
              onClick={() => {
                const ok = window.confirm('全データを削除しますか？');
                if (ok) setTasks([]);
              }}
              className="rounded-2xl border border-red-200 px-4 py-3 font-bold text-red-600"
            >
              全データ削除
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
