/** Copy dictionaries for the panel switcher surfaces. */

/** Dictionary namespace owned by this plugin. */
export const NS = 'panels'

/** Simplified Chinese dictionary and key source of truth. */
export const zh = {
  dockLabel: '面板',
  tabTerminal: '终端',
  tabBrowser: '浏览器',
  tabReview: '审查',
  tabAssistant: '辅助对话',
  tabFiles: '文件',
  panelTerminal: '终端',
  panelBrowser: '浏览器',
  panelReview: '变更评审',
  panelAssistant: '辅助对话',
  panelFiles: '文件',
  close: '关闭面板',
  comingSoon: '该面板能力正在开发中。',
  reviewBranch: '分支',
  reviewRefresh: '刷新',
  reviewLoading: '正在读取变更…',
  reviewEmpty: '工作区没有变更。',
  reviewNotRepo: '当前工作区不在 Git 仓库中。',
  reviewFailed: '读取 Git 状态失败。',
  reviewDiffFailed: '读取文件差异失败。',
  reviewDiffEmpty: '没有可显示的差异。',
  reviewUntrackedFile: '新文件',
  reviewUnstaged: '未暂存',
  reviewStaged: '已暂存',
  reviewUntracked: '未跟踪',
  reviewConflicted: '冲突',
  filesRoot: '工作区',
  filesBack: '返回上级',
  filesLoading: '正在读取目录…',
  filesFailed: '读取目录失败。',
  filesEmpty: '目录为空。',
} satisfies Record<string, string>

/** Panel switcher locale key union. */
export type PanelsLocaleKey = keyof typeof zh

/** English dictionary checked against the Chinese key set. */
export const en = {
  dockLabel: 'Panels',
  tabTerminal: 'Terminal',
  tabBrowser: 'Browser',
  tabReview: 'Review',
  tabAssistant: 'Assistant',
  tabFiles: 'Files',
  panelTerminal: 'Terminal',
  panelBrowser: 'Browser',
  panelReview: 'Change review',
  panelAssistant: 'Assistant',
  panelFiles: 'Files',
  close: 'Close panel',
  comingSoon: 'This panel is under development.',
  reviewBranch: 'Branch',
  reviewRefresh: 'Refresh',
  reviewLoading: 'Reading changes…',
  reviewEmpty: 'No working-tree changes.',
  reviewNotRepo: 'The workspace is not inside a Git repository.',
  reviewFailed: 'Failed to read Git status.',
  reviewDiffFailed: 'Failed to read the file diff.',
  reviewDiffEmpty: 'No diff to show.',
  reviewUntrackedFile: 'New file',
  reviewUnstaged: 'Unstaged',
  reviewStaged: 'Staged',
  reviewUntracked: 'Untracked',
  reviewConflicted: 'Conflicted',
  filesRoot: 'Workspace',
  filesBack: 'Up',
  filesLoading: 'Reading directory…',
  filesFailed: 'Failed to read the directory.',
  filesEmpty: 'The directory is empty.',
} satisfies Record<PanelsLocaleKey, string>
