import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HelpTip } from './HelpTip.jsx';
import { GLOSSARY } from '../utils/glossary.js';

afterEach(cleanup);

// jsdom reports every element as 0x0, so the placement maths needs a rect.
const stubRect = (rect) => {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    top: 400,
    bottom: 420,
    left: 300,
    right: 340,
    width: 40,
    height: 20,
    x: 300,
    y: 400,
    ...rect,
  });
};

describe('HelpTip', () => {
  it('renders nothing until asked', () => {
    render(<HelpTip term="price" />);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('renders the bubble into document.body, outside its own subtree', () => {
    stubRect();
    const { container } = render(
      <div style={{ overflow: 'hidden' }}>
        <HelpTip term="dayRange" />
      </div>,
    );

    fireEvent.mouseEnter(screen.getByRole('button'));

    const tooltip = screen.getByRole('tooltip');
    // The point of the portal: a clipping ancestor cannot cut the bubble off.
    expect(container.contains(tooltip)).toBe(false);
    expect(document.body.contains(tooltip)).toBe(true);
  });

  it('shows the glossary entry for the term', () => {
    stubRect();
    render(<HelpTip term="dayRange" />);
    fireEvent.mouseEnter(screen.getByRole('button'));

    expect(screen.getByRole('tooltip')).toHaveTextContent(GLOSSARY.dayRange.title);
    expect(screen.getByRole('tooltip')).toHaveTextContent('lowest and highest price');
    expect(screen.getByRole('tooltip')).toHaveTextContent(GLOSSARY.dayRange.note);
  });

  it('accepts explicit content instead of a glossary term', () => {
    stubRect();
    render(<HelpTip title="Custom" body="Explained here." />);
    fireEvent.focus(screen.getByRole('button'));

    expect(screen.getByRole('tooltip')).toHaveTextContent('Custom');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Explained here.');
  });

  it('closes on mouse leave and on blur', () => {
    stubRect();
    render(<HelpTip term="price" />);
    const trigger = screen.getByRole('button');

    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.mouseLeave(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('toggles on click, so touch devices without hover can read it', () => {
    stubRect();
    render(<HelpTip term="price" />);
    const trigger = screen.getByRole('button');

    fireEvent.click(trigger);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.click(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes on Escape and stays closed', () => {
    stubRect();
    render(<HelpTip term="price" />);
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();

    // Escape restores focus to the trigger; the open-on-focus handler must not
    // undo the dismissal.
    fireEvent.focus(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('can be reopened after Escape by moving away and back', () => {
    stubRect();
    render(<HelpTip term="price" />);
    const trigger = screen.getByRole('button');

    fireEvent.mouseEnter(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('reopens on an explicit tap after Escape', () => {
    stubRect();
    render(<HelpTip term="price" />);
    const trigger = screen.getByRole('button');

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(trigger);
    expect(screen.getByRole('tooltip')).toBeTruthy();
  });

  it('closes when something else is clicked', () => {
    stubRect();
    render(
      <>
        <HelpTip term="price" />
        <button type="button">elsewhere</button>
      </>,
    );
    fireEvent.click(screen.getByLabelText(/What is Price/));
    expect(screen.getByRole('tooltip')).toBeTruthy();

    fireEvent.pointerDown(screen.getByText('elsewhere'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('closes on scroll, since a fixed bubble would drift off its trigger', () => {
    stubRect();
    render(<HelpTip term="price" />);
    fireEvent.click(screen.getByRole('button'));

    fireEvent.scroll(document, {});
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('wires the trigger to the bubble for screen readers', () => {
    stubRect();
    render(<HelpTip term="price" />);
    const trigger = screen.getByRole('button');

    expect(trigger).toHaveAttribute('aria-label', 'What is Price?');
    expect(trigger.getAttribute('aria-describedby')).toBeNull();

    fireEvent.focus(trigger);
    expect(trigger.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('wraps a label when given children', () => {
    stubRect();
    render(<HelpTip term="volume">Volume</HelpTip>);
    const trigger = screen.getByRole('button', { name: /What is Volume/ });

    expect(trigger).toHaveTextContent('Volume');
    fireEvent.mouseEnter(trigger);
    expect(screen.getByRole('tooltip')).toHaveTextContent('shares changed hands');
  });

  describe('placement', () => {
    it('sits above the trigger when there is room', () => {
      stubRect({ top: 500, bottom: 520 });
      render(<HelpTip term="price" />);
      fireEvent.mouseEnter(screen.getByRole('button'));

      // Default jsdom viewport height is 768, so 500px down leaves room above.
      const { top } = screen.getByRole('tooltip').style;
      expect(Number.parseFloat(top)).toBeLessThan(500);
    });

    it('flips below when the trigger is near the top of the viewport', () => {
      stubRect({ top: 8, bottom: 28 });
      render(<HelpTip term="price" />);
      fireEvent.mouseEnter(screen.getByRole('button'));

      expect(Number.parseFloat(screen.getByRole('tooltip').style.top)).toBeGreaterThan(28);
    });

    it('stays inside the viewport when the trigger is at the right edge', () => {
      stubRect({ left: 1000, right: 1024, width: 24 });
      render(<HelpTip term="price" />);
      fireEvent.mouseEnter(screen.getByRole('button'));

      const tooltip = screen.getByRole('tooltip');
      const left = Number.parseFloat(tooltip.style.left);
      const width = Number.parseFloat(tooltip.style.width);
      expect(left + width).toBeLessThanOrEqual(window.innerWidth);
      expect(left).toBeGreaterThanOrEqual(0);
    });
  });
});
