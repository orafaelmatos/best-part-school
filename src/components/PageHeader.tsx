const PageHeader = ({ title, description }: { title: string; description?: string }) => (
  <div className="mb-8">
    <h1 className="text-2xl font-bold text-foreground">{title}</h1>
    {description && <p className="text-muted-foreground mt-1">{description}</p>}
  </div>
);

export default PageHeader;
