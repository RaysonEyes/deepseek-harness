/** Copy dictionaries for the plugin inventory Settings section. */

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  tab: '插件列表',
  loading: '正在读取插件…',
  error: '暂时无法读取插件。',
  retry: '重试',
  search: '搜索插件',
  catalog: '插件列表',
  empty: '暂无插件。',
  emptySearch: '没有匹配的插件。',
  enabledTag: '已启用',
  disabledTag: '已停用',
  configuration: '配置状态',
  cordis: 'Cordis 状态',
  unobserved: '未挂载',
  pending: '等待依赖',
  loadingPhase: '加载中',
  active: '已挂载',
  failed: '挂载失败',
  unloading: '卸载中',
  toggleEnable: '启用',
  toggleDisable: '停用',
  toggleInFlight: '正在应用…',
  toggleError: '切换失败,请重试。',
  toggleHint: '宿主层开关影响所有会话。由 agent 预设按会话挂载的工具,如已在预设中启用,请勿在宿主层重复开启。',
} satisfies Record<string, string>

/** Plugin inventory locale key union. */
export type PluginInventoryLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  tab: 'Plugin list',
  loading: 'Reading plugins…',
  error: 'Plugins are temporarily unavailable.',
  retry: 'Retry',
  search: 'Search plugins',
  catalog: 'Plugin list',
  empty: 'No plugins are available.',
  emptySearch: 'No matching plugins.',
  enabledTag: 'Enabled',
  disabledTag: 'Disabled',
  configuration: 'Configuration',
  cordis: 'Cordis status',
  unobserved: 'Not mounted',
  pending: 'Waiting for dependencies',
  loadingPhase: 'Loading',
  active: 'Mounted',
  failed: 'Mount failed',
  unloading: 'Unloading',
  toggleEnable: 'Enable',
  toggleDisable: 'Disable',
  toggleInFlight: 'Applying…',
  toggleError: 'Failed to toggle. Please retry.',
  toggleHint: 'Host-level switches affect every session. Tools mounted per-session by an agent preset should stay enabled in the preset, not re-enabled here.',
} satisfies Record<PluginInventoryLocaleKey, string>
