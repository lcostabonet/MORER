export default function CartLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 animate-pulse">
      <div className="h-8 w-40 bg-stone-100 rounded mb-14" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-14">
        <div className="lg:col-span-2 space-y-0">
          {[0, 1].map((i) => (
            <div key={i} className="flex gap-8 py-8 border-b border-stone-100">
              <div className="w-28 h-32 bg-stone-100 rounded-sm flex-shrink-0" />
              <div className="flex-1 space-y-3 py-2">
                <div className="h-4 w-1/2 bg-stone-100 rounded" />
                <div className="h-3 w-1/4 bg-stone-100 rounded" />
                <div className="h-9 w-28 bg-stone-100 rounded mt-4" />
              </div>
            </div>
          ))}
        </div>
        <div className="lg:col-span-1">
          <div className="bg-stone-50 p-8 h-64 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
