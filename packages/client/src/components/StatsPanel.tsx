import { ATTRIBUTES, STAMINA_MAX, attrValue, effectiveStats } from '@idollife/core';
import type { AppApi } from './api';

const HIDDEN_CATEGORIES = new Set(['trait', 'negative', 'hidden', 'proficient']);

export function StatsPanel({ api }: { api: AppApi }) {
  const { run, totalFans } = api;

  const groups = new Map<
    string,
    { name: string; items: Array<{ key: string; name: string }> }
  >();
  for (const a of ATTRIBUTES) {
    const g = groups.get(a.category) ?? { name: a.categoryName, items: [] };
    g.items = [...g.items, { key: a.key, name: a.name }];
    groups.set(a.category, g);
  }

  return (
    <>
      <div className="mod-head">
        <h2>属性</h2>
      </div>

      <div className="attr-groups">
        {[...groups.entries()].map(([category, group]) => {
          const hidden = HIDDEN_CATEGORIES.has(category);
          return (
            <section key={category} className="attr-group">
              <h4>
                {group.name}
                {hidden && <em className="attr-hidden">仅占卜可见</em>}
              </h4>
              <div className="attr-list">
                {group.items.map((a) => {
                  const value = attrValue(run, a.key);
                  const max = a.key === 'stamina' ? STAMINA_MAX : 100;
                  const isStatus = category === 'status';
                  return (
                    <div key={a.key} className={isStatus ? 'attr-item attr-vital' : 'attr-item'}>
                      <span className="k">{a.name}</span>
                      {isStatus ? (
                        <span className="v">
                          {value}
                          <em>/{max}</em>
                        </span>
                      ) : (
                        <span className="v">{hidden ? '？' : value}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        <section className="attr-group">
          <h4>资源</h4>
          <div className="attr-list">
            <div className="attr-item">
              <span className="k">资金</span>
              <span className="v">{run.money}</span>
            </div>
            <div className="attr-item">
              <span className="k">粉丝</span>
              <span className="v">{totalFans(run)}</span>
            </div>
          </div>
        </section>
      </div>

      <p className="muted small eff">
        实际属性：
        {Object.entries(effectiveStats(run))
          .map(([k, v]) => `${k} ${v}`)
          .join(' · ')}
      </p>
    </>
  );
}
