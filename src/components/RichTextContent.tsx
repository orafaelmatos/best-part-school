import { isRichTextEmpty, sanitizeRichText } from "@/lib/richText";

type RichTextContentProps = {
  value?: string | null;
  fallback?: string;
  className?: string;
};

const RichTextContent = ({ value, fallback = "Nao informado", className = "" }: RichTextContentProps) => {
  if (isRichTextEmpty(value)) {
    return <p className={className}>{fallback}</p>;
  }

  return (
    <div
      className={`rich-text-display ${className}`}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(value) }}
    />
  );
};

export default RichTextContent;
