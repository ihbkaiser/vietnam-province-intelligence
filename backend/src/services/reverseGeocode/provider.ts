import type { ResolveAdminUnitRequest, ReverseGeocodeBundle } from '../../types/admin.js';

export interface ReverseGeocodeProvider {
  readonly providerName: string;
  reverseGeocode(input: ResolveAdminUnitRequest): Promise<ReverseGeocodeBundle>;
}

// TODO: Add more real providers when needed, but keep the bundle contract so old/new labels can coexist.
