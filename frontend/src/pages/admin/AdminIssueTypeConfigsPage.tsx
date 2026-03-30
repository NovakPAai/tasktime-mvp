import AdminIssueTypeConfigsTab from '../../components/admin/AdminIssueTypeConfigsTab';

export default function AdminIssueTypeConfigsPage() {
  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Типы задач</h1>
          <p className="tt-page-subtitle">Управление типами задач и подзадач</p>
        </div>
      </div>
      <AdminIssueTypeConfigsTab />
    </div>
  );
}
