import Link from "next/link";

const Navbar = () => {
	return (
		<nav className="w-full h-16 bg-gray-800 text-white flex items-center justify-between px-4">
			<div>
				<h1 className="text-2xl ">Pixtopia</h1>
			</div>
			{/* <div></div> */}
			<div className="flex flex-row gap-4">
				<Link href="/login" className="bg-slate-600 p-2 rounded-md">
					Login
				</Link>
				<Link href="/register" className="bg-slate-600 p-2 rounded-md">
					Register
				</Link>
			</div>
		</nav>
	);
};

export default Navbar;
