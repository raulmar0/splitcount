import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import Renderer from 'react-test-renderer';
import { createServer } from 'vite';

const { act } = Renderer;
let server, ExpenseForm;
const roots = [];
const group = { id: 'dinner', name: 'Dinner', currency: 'USD', members: [{ id: 'ana', name: 'Ana' }, { id: 'beto', name: 'Beto' }] };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalError = console.error;
console.error = (...args) => { if (!String(args[0]).includes('react-test-renderer is deprecated')) originalError(...args); };
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, optimizeDeps: { noDiscovery: true } });
  ({ default: ExpenseForm } = await server.ssrLoadModule('/src/ExpenseForm.jsx'));
});
afterEach(async () => { await act(async () => { for (const root of roots.splice(0)) root.unmount(); }); });
after(async () => { await server?.close(); console.error = originalError; });

async function mount() {
  let root;
  const saved = [];
  await act(async () => {
    root = Renderer.create(React.createElement(ExpenseForm, { group, onSave: expense => saved.push(expense), onClose() {} }), {
      createNodeMock: () => ({ showModal() {}, close() {}, querySelector() { return null; }, focus() {}, addEventListener() {}, removeEventListener() {}, closest() { return null; } }),
    });
    roots.push(root);
  });
  const input = id => root.root.findAllByType('input').find(node => node.props.id === id);
  return { root, saved, text: () => JSON.stringify(root.toJSON()), change: async (id, value) => act(async () => input(id).props.onChange({ target: { value } })),
    exact: async () => act(async () => root.root.findAllByType('button').find(button => button.props.children === 'Importes exactos').props.onClick()),
    submit: async () => act(async () => root.root.findByType('form').props.onSubmit({ preventDefault() {} })),
  };
}

test('blank, invalid and zero expense amounts render finite equal-share previews', async () => {
  const app = await mount();
  for (const amount of ['', 'nonsense', '0', '-1']) {
    await app.change('expense-amount', amount);
    assert.ok(!app.text().includes('NaN'), `preview for ${JSON.stringify(amount)}`);
    const previews = app.root.root.findAllByProps({ className: 'split-member ' }).map(member => member.children.at(-1).children.join(''));
    assert.equal(previews.length, group.members.length);
    assert.ok(previews.every(value => /0[.,]00$/.test(value)));
  }
});

test('an empty exact split does not claim that the total matches', async () => {
  const app = await mount();
  await app.exact();
  assert.equal(app.root.root.findAll(node => node.props.role === 'status').length, 0);
  await app.change('expense-amount', '10');
  const status = app.root.root.findByProps({ role: 'status' });
  assert.ok(!status.props.className.includes('positive'));
  assert.match(status.props.children, /Faltan por repartir/);
});

test('one submit saves the complete equal split without a second step', async () => {
  const app = await mount();
  await app.change('expense-amount', '10.01');
  await app.change('expense-title', 'Dinner');
  await app.submit();
  assert.equal(app.saved.length, 1);
  assert.equal(app.saved[0].amount, 1001);
  assert.deepEqual(app.saved[0].shares, { ana: 501, beto: 500 });
});
