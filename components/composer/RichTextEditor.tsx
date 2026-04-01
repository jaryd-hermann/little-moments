import { forwardRef } from "react";
import { StyleSheet } from "react-native";
import { RichEditor } from "react-native-pell-rich-editor";
import { useTheme } from "@/hooks/useTheme";

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
    const { colors } = useTheme();
    const contentCSSText = `font-family: Roboto-Regular, Roboto, sans-serif; font-size: 17px; line-height: 28px; color: ${colors.text}; text-align: left; margin: 0; padding: 0;`;
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
          backgroundColor: colors.background,
          color: colors.text,
          placeholderColor: colors.textMuted,
          contentCSSText,
          paddingHorizontal: 0,
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
