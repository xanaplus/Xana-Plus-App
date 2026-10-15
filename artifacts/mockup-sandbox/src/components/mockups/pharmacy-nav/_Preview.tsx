import { useState, type ComponentType } from 'react';
import { NavTheme } from './_context';
import { colors, darkColors } from './_tokens';
import './_group.css';

export function Preview({ Bar, note }: { Bar: ComponentType<any>; note: string }) {
  const [selected, setSelected] = useState(0);
  const [dark, setDark] = useState(false);
  const routes = ['index', 'categories', 'pharmacy', 'cart', 'profile'].map(name => ({ name, key: name }));
  const palette = dark ? darkColors : colors;
  return (
    <NavTheme.Provider value={dark}>
      <div className="nav-demo" style={{ background: palette.background, color: palette.onSurface }}>
        <div className="nav-demo-controls">
          <span>{['Home', 'Categories', 'Pharmacy', 'Cart', 'Profile'][selected]} selected</span>
          <button onClick={() => setDark(value => !value)}>{dark ? 'Light mode' : 'Dark mode'}</button>
        </div>
        <p className="nav-demo-note">{note}</p>
        <div className="nav-demo-stage">
          <Bar state={{ index: selected, routes }} navigation={{
            emit: () => ({ defaultPrevented: false }),
            navigate: (name: string) => setSelected(routes.findIndex(route => route.name === name)),
          }} />
        </div>
      </div>
    </NavTheme.Provider>
  );
}
