import api from './client';
import type { IssueLink, IssueLinkType } from '../types';

export interface IssueLinksResponse {
  outbound: IssueLink[];
  inbound: IssueLink[];
}

export async function getIssueLinks(issueId: string): Promise<IssueLinksResponse> {
  const { data } = await api.get<IssueLinksResponse>(`/issues/${issueId}/links`);
  return data;
}

export async function createIssueLink(
  issueId: string,
  body: { targetIssueId: string; linkTypeId: string },
): Promise<IssueLink> {
  const { data } = await api.post<IssueLink>(`/issues/${issueId}/links`, body);
  return data;
}

export async function deleteIssueLink(issueId: string, linkId: string): Promise<void> {
  await api.delete(`/issues/${issueId}/links/${linkId}`);
}

// Admin
export async function listLinkTypes(includeInactive = false): Promise<IssueLinkType[]> {
  const { data } = await api.get<IssueLinkType[]>('/admin/link-types', {
    params: includeInactive ? { includeInactive: 'true' } : {},
  });
  return data;
}

export async function createLinkType(body: {
  name: string;
  outboundName: string;
  inboundName: string;
}): Promise<IssueLinkType> {
  const { data } = await api.post<IssueLinkType>('/admin/link-types', body);
  return data;
}

export async function updateLinkType(
  id: string,
  body: { name?: string; outboundName?: string; inboundName?: string; isActive?: boolean },
): Promise<IssueLinkType> {
  const { data } = await api.patch<IssueLinkType>(`/admin/link-types/${id}`, body);
  return data;
}
