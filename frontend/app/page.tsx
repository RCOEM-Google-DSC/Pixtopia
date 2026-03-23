import Hero from "./Components/Home/Hero";
import HomepageDesign from "./Components/Home/HomepageDesign";
import SiteNavbar from "./Components/Navigation/DashboardNavbar";

export default function Home() {
	return (
		<div className="font-thin">
			<SiteNavbar />
			<Hero />
			<HomepageDesign />
		</div>
	);
}

