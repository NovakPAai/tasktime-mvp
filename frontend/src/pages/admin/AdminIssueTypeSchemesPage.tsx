import AdminIssueTypeSchemesTab from '../../components/admin/AdminIssueTypeSchemesTab';

export default function AdminIssueTypeSchemesPage() {
  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Схемы типов задач</h1>
          <p className="tt-page-subtitle">Управление схемами типов задач и привязкой к проектам</p>
        </div>
      </div>
      <AdminIssueTypeSchemesTab />
    </div>
  );
}
