import { Fragment } from 'react';
import {
  ATTRIBUTES,
  STAMINA_MAX,
  STAT_LABEL,
  appearanceLabel,
  attrValue,
  effectiveStats,
  type AttributeDef,
} from '@idollife/core';
import type { AppApi } from './api';
import { FanRadar } from './FanRadar';

/**
 * 属性面板（T-014 改版）
 *
 * - 显隐性全部读数据里的 `hidden` / `linked` 标志，不再硬编码打码
 *   - `linked === 0` 的整组不渲染（目前只有熟练度三项）
 *   - `linked === 2` 标「仅占卜可见」，`hidden === true` 标「主界面不显示」，都只是灰色小标
 * - 分组顺序显式写死，不依赖数据行序
 * - 样貌只显示 appearanceLabel 的文案，不显示数字
 * - 粉丝构成用六轴雷达图（FanRadar），不占用下面的属性列表
 */
const GROUP_ORDER = ['visible', 'status', 'innate', 'trait', 'negative', 'hidden'] as const;

const thousands = (n: number) => Math.round(n).toLocaleString('zh-CN');

export function StatsPanel({ api }: { api: AppApi }) {
  const { run, totalFans } = api;

  const groups = new Map<string, { name: string; items: AttributeDef[] }>();
  for (const a of ATTRIBUTES) {
    const g = groups.get(a.category) ?? { name: a.categoryName, items: [] };
    g.items = [...g.items, a];
    groups.set(a.category, g);
  }

  return (
    <>
      <div className="mod-head">
        <h2>属性</h2>
      </div>

      <div className="attr-groups">
        {GROUP_ORDER.map((category) => {
          const group = groups.get(category);
          if (!group) return null;

          // linked === 0：整组不渲染（目前只有熟练度三项）
          const items = group.items.filter((a) => a.linked !== 0);
          if (items.length === 0) return null;

          const divineOnly = items.some((a) => a.linked === 2);
          const hiddenMain = items.some((a) => a.hidden);
          const isStatus = category === 'status';
          const isStat = category === 'visible';
          const isSlim = category === 'trait' || category === 'negative' || category === 'hidden';

          return (
            <Fragment key={category}>
              <section className="attr-group">
                <h4>
                  {group.name}
                  {divineOnly ? <em className="attr-badge">仅占卜可见</em> : null}
                  {hiddenMain ? <em className="attr-badge">主界面不显示</em> : null}
                </h4>
                <div className="attr-list">
                  {items.map((a) => {
                    const value = attrValue(run, a.key);
                    const max = a.key === 'stamina' ? STAMINA_MAX : 100;
                    const showBar = isStat || isStatus || isSlim;
                    const percent = Math.max(0, Math.min(100, (value / max) * 100));
                    const tone = isStatus
                      ? value < 15
                        ? 'danger'
                        : value < 30
                          ? 'warn'
                          : ''
                      : category === 'negative'
                        ? 'cold'
                        : '';
                    return (
                      <div key={a.key} className={isStatus ? 'attr-item attr-vital' : 'attr-item'}>
                        <div className="attr-row">
                          <span className="k">{a.name}</span>
                          {a.key === 'appearance' ? (
                            <span className="v attr-text">{appearanceLabel(value)}</span>
                          ) : isStatus ? (
                            <span className="v">
                              {value}
                              <em>/{max}</em>
                            </span>
                          ) : (
                            <span className="v">{value}</span>
                          )}
                        </div>
                        {showBar ? (
                          <span
                            className={['attr-bar', isStat || isStatus ? '' : 'slim', tone]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            <i style={{ width: percent + '%' }} />
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </section>

              {category === 'visible' ? (
                <section className="attr-group attr-radar-wrap">
                  <h4>
                    粉丝构成
                    <em className="attr-badge">主界面不显示</em>
                  </h4>
                  <FanRadar run={run} />
                </section>
              ) : null}
            </Fragment>
          );
        })}

        <section className="attr-group">
          <h4>资源</h4>
          <div className="attr-list">
            <div className="attr-item">
              <div className="attr-row">
                <span className="k">资金</span>
                <span className="v">¥{thousands(run.money)}</span>
              </div>
            </div>
            <div className="attr-item">
              <div className="attr-row">
                <span className="k">粉丝</span>
                <span className="v">{thousands(totalFans(run))}</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <p className="muted small eff">
        实际属性：
        {Object.entries(effectiveStats(run))
          .map(([k, v]) => `${STAT_LABEL[k] ?? k} ${v}`)
          .join(' · ')}
      </p>
    </>
  );
}
