/**
 * BrowseView — lazy-loaded view for arbitrary URL iframes.
 */
export default function BrowseView({ url, name }: { url: string; name: string }) {
  return (
    <iframe
      src={url}
      className="h-full w-full border-0 flex-1"
      title={name}
      sandbox="allow-downloads allow-forms allow-same-origin allow-scripts allow-popups allow-modals allow-popups-to-escape-sandbox"
    />
  );
}
