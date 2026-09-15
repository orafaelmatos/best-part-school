import { useMemo, type CSSProperties } from "react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: number;
};

const RichTextEditor = ({ value, onChange, placeholder, minHeight = 120 }: RichTextEditorProps) => {
  const modules = useMemo(
    () => ({
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline", "strike", "blockquote"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link"],
        ["clean"],
      ],
    }),
    [],
  );

  const formats = useMemo(
    () => ["header", "bold", "italic", "underline", "strike", "blockquote", "list", "bullet", "link"],
    [],
  );

  return (
    <div className="rich-text-editor" style={{ "--rich-text-min-height": `${minHeight}px` } as CSSProperties}>
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        modules={modules}
        formats={formats}
      />
    </div>
  );
};

export default RichTextEditor;
