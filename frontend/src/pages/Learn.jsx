import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import useAsync from '../hooks/useAsync.js';
import learnApi from '../services/learnApi.js';
import { GLOSSARY } from '../utils/glossary.js';
import { LESSONS, LESSON_BY_ID } from '../utils/lessons.js';

function LessonCard({ lesson, read }) {
  return (
    <Link
      to={`/learn/${lesson.id}`}
      className="panel group block p-5 transition hover:border-ink-700"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-medium text-paper group-hover:text-signal">{lesson.title}</h2>
        {read && <span className="label shrink-0">read</span>}
      </div>
      <p className="mt-1.5 text-sm text-muted">{lesson.summary}</p>
      <p className="label mt-3">{lesson.minutes} min</p>
    </Link>
  );
}

function Glossary() {
  const [term, setTerm] = useState('');
  const entries = Object.entries(GLOSSARY).filter(([, entry]) => {
    const haystack = `${entry.title} ${entry.body}`.toLowerCase();
    return haystack.includes(term.trim().toLowerCase());
  });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Glossary</h2>
        <input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search a term"
          aria-label="Search the glossary"
          className="w-full rounded-md border border-ink-800 bg-ink-950 px-3 py-2 text-sm text-paper placeholder:text-faint focus:border-signal/60 focus:outline-none sm:w-64"
        />
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-muted">Nothing matches “{term}”.</p>
      ) : (
        <dl className="divide-y divide-ink-850 overflow-hidden rounded-lg border border-ink-800">
          {entries.map(([key, entry]) => (
            <div key={key} className="p-4">
              <dt className="text-sm font-medium text-paper">{entry.title}</dt>
              <dd className="mt-1 text-sm leading-relaxed text-muted">{entry.body}</dd>
              {entry.note && <dd className="mt-1.5 text-xs text-faint">{entry.note}</dd>}
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

/** One lesson, with a "mark as read" that feeds the getting-started checklist. */
function LessonDetail({ lesson, progress }) {
  const [read, setRead] = useState(progress?.lessonsRead?.includes(lesson.id) ?? false);
  const [saving, setSaving] = useState(false);

  const markRead = async () => {
    setSaving(true);
    try {
      await learnApi.markLessonRead(lesson.id);
      setRead(true);
    } finally {
      setSaving(false);
    }
  };

  const index = LESSONS.findIndex((item) => item.id === lesson.id);
  const next = LESSONS[index + 1];

  return (
    <article className="max-w-2xl space-y-6">
      <div>
        <Link to="/learn" className="text-sm text-muted transition hover:text-signal">
          ← All lessons
        </Link>
        <p className="label mt-4">
          Lesson {index + 1} of {LESSONS.length} · {lesson.minutes} min
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">{lesson.title}</h1>
      </div>

      <div className="space-y-4">
        {lesson.body.map((paragraph) => (
          <p key={paragraph.slice(0, 24)} className="text-[15px] leading-relaxed text-muted">
            {paragraph}
          </p>
        ))}
      </div>

      <p className="rounded-md border border-signal/40 bg-signal/5 p-4 text-sm text-paper">
        <span className="label mb-1 block">Takeaway</span>
        {lesson.takeaway}
      </p>

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-800 pt-5">
        {read ? (
          <span className="text-sm text-up">Marked as read.</span>
        ) : (
          <button
            type="button"
            onClick={markRead}
            disabled={saving}
            className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-signal/90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Mark as read'}
          </button>
        )}
        {next && (
          <Link
            to={`/learn/${next.id}`}
            className="rounded-md border border-ink-700 px-4 py-2 text-sm text-paper transition hover:border-signal hover:text-signal"
          >
            Next: {next.title}
          </Link>
        )}
      </div>
    </article>
  );
}

export function Learn() {
  const { lessonId } = useParams();
  const { data: progress } = useAsync(({ signal }) => learnApi.fetchProgress({ signal }), []);

  if (lessonId) {
    const lesson = LESSON_BY_ID[lessonId];
    if (!lesson) {
      return (
        <div className="space-y-3">
          <h1 className="text-xl font-semibold">No such lesson</h1>
          <Link to="/learn" className="text-sm text-muted hover:text-signal">
            ← All lessons
          </Link>
        </div>
      );
    }
    return <LessonDetail lesson={lesson} progress={progress} />;
  }

  const read = new Set(progress?.lessonsRead ?? []);

  return (
    <div className="space-y-8">
      <div>
        <p className="label">Learn</p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
          How this works, from the beginning
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Eight short lessons, in the order you actually meet these ideas. They explain mechanics —
          none of them tell you what to buy.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {LESSONS.map((lesson) => (
          <LessonCard key={lesson.id} lesson={lesson} read={read.has(lesson.id)} />
        ))}
      </div>

      <Glossary />
    </div>
  );
}

export default Learn;
