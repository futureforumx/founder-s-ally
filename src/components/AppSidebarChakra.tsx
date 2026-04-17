import { useState } from "react";
import {
  Box,
  Flex,
  VStack,
  Button,
  HStack,
  Avatar,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  MenuDivider,
  Text,
  useColorModeValue,
} from "@chakra-ui/react";
import { FileText, Settings, Handshake, Gauge, Users, UsersRound, LogOut, UserCog, ChevronDown } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { useProfile } from "@/hooks/useProfile";
import { useAuth } from "@/hooks/useAuth";
import { NETWORK_SURFACE_DISPLAY_NAME } from "@/lib/networkNavVariant";

type ViewType = "home" | "company" | "dashboard" | "audit" | "benchmarks" | "investors" | "investor-search" | "directory" | "connections" | "messages" | "events" | "competitors" | "sector" | "groups" | "settings";

interface AppSidebarChakraProps {
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
}

const topItems = [
  { id: "dashboard" as const, label: "Mission Control", icon: Gauge },
];

const companyItems = [
  { id: "audit" as const, label: "Deck Audit", icon: FileText },
];

const communityItems = [
  { id: "directory" as const, label: "Directory", icon: FileText },
  { id: "groups" as const, label: "Groups", icon: UsersRound },
  { id: "events" as const, label: "Events", icon: FileText },
];

export function AppSidebarChakra({ activeView, onViewChange }: AppSidebarChakraProps) {
  const { profile } = useProfile();
  const { user, signOut } = useAuth();
  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";
  const initials = displayName.split(" ").map((n: string) => n[0]).join("").slice(0, 2).toUpperCase();

  const bgColor = useColorModeValue("gray.900", "gray.900");
  const hoverBg = useColorModeValue("gray.800", "gray.800");
  const activeBg = useColorModeValue("blue.600", "blue.600");
  const textColor = useColorModeValue("white", "white");
  const secondaryText = useColorModeValue("gray.400", "gray.400");

  const NavButton = ({ item, isActive }: { item: { id: ViewType; label: string; icon: any }; isActive: boolean }) => {
    const Icon = item.icon;
    return (
      <Button
        width="full"
        justifyContent="flex-start"
        bg={isActive ? activeBg : "transparent"}
        color={isActive ? textColor : secondaryText}
        _hover={{ bg: isActive ? activeBg : hoverBg }}
        onClick={() => onViewChange(item.id)}
        leftIcon={<Icon size={16} />}
        fontSize="sm"
        fontWeight={isActive ? "600" : "500"}
      >
        {item.label}
      </Button>
    );
  };

  return (
    <Flex
      h="100vh"
      w="176px"
      direction="column"
      bg={bgColor}
      color={textColor}
      borderRight="1px solid"
      borderRightColor={useColorModeValue("gray.700", "gray.700")}
    >
      {/* Logo */}
      <Box p={5}>
        <Box
          as="button"
          type="button"
          onClick={() => onViewChange("home")}
          aria-label="Go to start page"
          display="block"
          width="100%"
        >
          <BrandLogo variant="white" sidebarMode="expanded" className="max-h-20 w-auto max-w-full object-contain" />
        </Box>
      </Box>

      {/* Navigation */}
      <VStack spacing={1} px={3} mt={4} flex={1} overflowY="auto">
        {/* Top Section */}
        {topItems.map((item) => (
          <NavButton key={item.id} item={item} isActive={activeView === item.id} />
        ))}

        {/* Company Section */}
        <Text fontSize="xs" fontWeight="600" color={secondaryText} textTransform="uppercase" mt={3} mb={2} opacity={0.6}>
          My Company
        </Text>
        {companyItems.map((item) => (
          <NavButton key={item.id} item={item} isActive={activeView === item.id} />
        ))}

        {/* Investors */}
        <NavButton
          item={{ id: "investors", label: "Investors", icon: Users }}
          isActive={activeView === "investors" || activeView === "investor-search" || activeView === "connections"}
        />

        {/* Network */}
        <NavButton
          item={{ id: "directory", label: NETWORK_SURFACE_DISPLAY_NAME, icon: Users }}
          isActive={activeView === "directory" || activeView === "groups" || activeView === "events"}
        />
      </VStack>

      {/* Footer - User Menu */}
      <Box p={3} borderTopWidth={1} borderTopColor={useColorModeValue("gray.700", "gray.700")}>
        <Menu>
          <MenuButton
            as={Button}
            rightIcon={<ChevronDown size={16} />}
            width="full"
            justifyContent="space-between"
            bg="transparent"
            color={textColor}
            _hover={{ bg: hoverBg }}
            textAlign="left"
          >
            <HStack spacing={2}>
              <Avatar size="sm" name={displayName} />
              <VStack spacing={0} align="flex-start">
                <Text fontSize="xs" fontWeight="600">{displayName}</Text>
                <Text fontSize="xs" color={secondaryText}>{user?.email}</Text>
              </VStack>
            </HStack>
          </MenuButton>
          <MenuList bg={bgColor} borderColor={useColorModeValue("gray.700", "gray.700")}>
            <MenuItem
              onClick={() => onViewChange("settings")}
              icon={<Settings size={16} />}
              color={textColor}
              _hover={{ bg: hoverBg }}
            >
              Settings
            </MenuItem>
            <MenuDivider borderColor={useColorModeValue("gray.700", "gray.700")} />
            <MenuItem
              onClick={signOut}
              icon={<LogOut size={16} />}
              color="red.400"
              _hover={{ bg: "red.900" }}
            >
              Sign out
            </MenuItem>
          </MenuList>
        </Menu>
      </Box>
    </Flex>
  );
}
