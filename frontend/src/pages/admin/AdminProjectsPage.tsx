import AdminProjectsTab from '../../components/admin/AdminProjectsTab';

export default function AdminProjectsPage() {
  return (
    <div className="tt-page">
      <div className="tt-page-header">
        <div>
          <h1 className="tt-page-title">Проекты</h1>
          <p className="tt-page-subtitle">Управление проектами и их настройками</p>
        </div>
      </div>
      <AdminProjectsTab />
    </div>
  );
}
