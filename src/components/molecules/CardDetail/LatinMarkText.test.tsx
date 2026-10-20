// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LatinMarkText } from './LatinMarkText';

const clauses = (el: HTMLElement) => [...el.querySelectorAll('.story-clause')].map((c) => c.textContent);

describe('LatinMarkText', () => {
  it('keeps a CJK title’s clauses whole, breaking only after its punctuation', () => {
    const { container } = render(<h1><LatinMarkText text="湖中央，我看見了知行合一" /></h1>);
    expect(clauses(container)).toEqual(['湖中央，', '我看見了知行合一']);
    expect(container.textContent).toBe('湖中央，我看見了知行合一');
  });

  it('leaves a title of one clause as plain text', () => {
    const { container } = render(<h1><LatinMarkText text="錢是什麼？" /></h1>);
    expect(container.querySelector('.story-clause')).toBeNull();
    expect(container.querySelector('h1')!.innerHTML).toBe('錢是什麼？');
  });

  it('still sets apart an apostrophe inside a Latin word within a clause', () => {
    const { container } = render(<h1><LatinMarkText text="我說 don’t，你說好" /></h1>);
    expect(clauses(container)).toEqual(['我說 don’t，', '你說好']);
    expect(container.querySelector('.story-clause .story-latin-mark')?.textContent).toBe('’');
  });
});
