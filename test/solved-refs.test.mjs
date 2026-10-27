import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Load the real src/scripts/05-markdown.js into a sandbox that supplies the globals it reads.
function load({ tasks = [], archivedTasks = [], columns = [{ id: 'todo' }, { id: 'done' }] } = {}) {
    const ctx = vm.createContext({ tasks, archivedTasks, config: { columns } });
    vm.runInContext(readFileSync(new URL('../src/scripts/05-markdown.js', import.meta.url), 'utf8'), ctx);
    return ctx;
}

const task = (id, extra = {}) => ({ id, title: `Title of ${id}`, status: 'todo', completed: '', ...extra });

const ctx = load({
    tasks: [
        task('TASK-001', { status: 'done' }),
        task('TASK-002', { completed: '2026-01-02' }),
        task('TASK-003'),
        task('TASK-004', { status: 'done', title: 'Fix <x> & "y"' }),
    ],
    archivedTasks: [task('TASK-005')],
});
const md = s => ctx.markdownToHtml(s);
const struck = (html, ref) => html.includes(`>${ref}</del>`);

test('strikes refs to tasks in the last column, finished, or archived', () => {
    for (const n of ['001', '002', '005']) {
        const html = md(`Depends on TASK-${n}`);
        assert.ok(struck(html, `TASK-${n}`), `TASK-${n} should be struck: ${html}`);
        assert.match(html, /class="task-ref--solved"/);
    }
});

test('leaves open, unknown and malformed refs alone', () => {
    for (const ref of ['TASK-003', 'TASK-999', 'TASK-001a', 'XTASK-001']) {
        assert.ok(!md(`See ${ref}`).includes('<del'), ref);
    }
});

test('matches unpadded IDs and uses the title as escaped tooltip', () => {
    const html = md('after TASK-4');
    assert.ok(struck(html, 'TASK-4'));
    assert.ok(html.includes('title="Fix &lt;x&gt; &amp; &quot;y&quot;"'), html);
});

test('ignores inline code, code blocks and link URLs', () => {
    assert.ok(!md('`TASK-001`').includes('<del'));
    assert.ok(!md('```\nTASK-001\n```').includes('<del'));
    const link = md('[docs](https://x.test/TASK-001)');
    assert.ok(link.includes('href="https://x.test/TASK-001"') && !link.includes('<del'), link);
});

test('without a task list or columns nothing is struck and nothing throws', () => {
    const empty = load({ columns: undefined });
    assert.equal(empty.markdownToHtml('TASK-001'), '<p style="margin: 0.5rem 0;">TASK-001</p>');
});

test('strikes refs inside a task\'s **Notes** section, end to end', () => {
    const c = load({ tasks: [task('TASK-001', { status: 'done' }), task('TASK-003')] });
    vm.runInContext(readFileSync(new URL('../src/scripts/04-io.js', import.meta.url), 'utf8'), c);
    const parsed = c.parseTask('TASK-010', 'With notes', 'Desc\n\n**Notes**:\nBlocked by TASK-001, then TASK-003.\n', 'todo');
    assert.match(parsed.notes, /TASK-001/);
    const html = c.markdownToHtml(parsed.notes);
    assert.ok(struck(html, 'TASK-001'), html);
    assert.ok(!struck(html, 'TASK-003'), html);
});

test('strikes refs in escaped plain text such as subtask labels', () => {
    const html = ctx.markSolvedTaskRefs('Check other jobs (see TASK-001 notes) &lt;b&gt; TASK-003');
    assert.ok(struck(html, 'TASK-001'), html);
    assert.ok(!struck(html, 'TASK-003'), html);
    assert.ok(html.includes('&lt;b&gt;'), html);
});
