// Einstieg für den eingebetteten Editor der Notizen. Nur was die Notizen brauchen, damit die Datei klein bleibt.
// Markdown kommt direkt aus @lezer/markdown (GFM plus ==Markieren==), ohne @codemirror/lang-markdown,
// das HTML, CSS und JavaScript mitbringen würde.
export { EditorView, ViewPlugin, Decoration, WidgetType, keymap, placeholder, drawSelection } from '@codemirror/view';
export { EditorState, EditorSelection, Transaction, Annotation } from '@codemirror/state';
export { history, defaultKeymap, historyKeymap, indentMore, indentLess, undo, redo } from '@codemirror/commands';
export { syntaxTree, indentUnit, Language, LanguageSupport, defineLanguageFacet } from '@codemirror/language';
export { parser as mdParser, GFM } from '@lezer/markdown';
