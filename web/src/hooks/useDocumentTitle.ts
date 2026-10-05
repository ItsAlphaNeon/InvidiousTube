import { useEffect } from 'react';
import { useSettings } from '../stores/settings';

export function useDocumentTitle(title?: string) {
  const brand = useSettings((s) => s.brand);
  useEffect(() => {
    document.title = title ? `${title} - ${brand}` : brand;
  }, [title, brand]);
}
