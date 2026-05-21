export default function OrderLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 animate-pulse">
      <div className="h-3 w-24 bg-stone-100 rounded mb-14" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-14">
        <div className="lg:col-span-2">
          <div className="h-8 w-48 bg-stone-100 rounded mb-2" />
          <div className="h-3 w-32 bg-stone-100 rounded mb-10" />
          <div className="bg-stone-50 h-16 rounded-sm mb-10" />
          <div className="divide-y divide-stone-100">
            {[0, 1].map((i) => (
              <div key={i} className="py-6 flex justify-between gap-6">
                <div className="space-y-2">
                  <div className="h-4 w-32 bg-stone-100 rounded" />
                  <div className="h-3 w-20 bg-stone-100 rounded" />
                  <div className="h-3 w-16 bg-stone-100 rounded" />
                </div>
                <div className="h-4 w-16 bg-stone-100 rounded flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
        <div className="lg:col-span-1">
          <div className="bg-stone-50 p-8 h-72 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
