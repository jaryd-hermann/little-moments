import { forwardRef } from "react";
import { StyleSheet } from "react-native";
import { RichEditor } from "react-native-pell-rich-editor";

interface RichTextEditorProps {
  initialContent?: string;
  placeholder?: string;
  onChange: (html: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const RichTextEditor = forwardRef<RichEditor, RichTextEditorProps>(
  function RichTextEditor(
    { initialContent, placeholder, onChange, onFocus, onBlur },
    ref
  ) {
    return (
      <RichEditor
        ref={ref}
        initialContentHTML={initialContent}
        placeholder={
          placeholder ??
          "Write about your moment... What happened? What did you notice?"
        }
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        style={styles.editor}
        editorStyle={{
          backgroundColor: "#000000",
          color: "#FFFFFF",
          placeholderColor: "rgba(255, 255, 255, 0.3)",
          contentCSSText:
            "font-family: 'LibreBaskerville-Regular', serif; font-size: 16px; line-height: 28px; color: #FFFFFF;",
        }}
      />
    );
  }
);

const styles = StyleSheet.create({
  editor: {
    flex: 1,
    minHeight: 200,
  },
});
